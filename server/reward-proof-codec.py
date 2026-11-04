"""Pure OpenTimestamps codec. No networking, files, wallet keys or application DB.

Receives bounded JSON over stdin. All URLs emitted by a proof are untrusted;
Node's transport independently allowlists them before any network request.
"""
import base64
import json
import sys
from opentimestamps.core.op import OpSHA256
from opentimestamps.core.timestamp import Timestamp, DetachedTimestampFile
from opentimestamps.core.serialize import BytesDeserializationContext, BytesSerializationContext
from opentimestamps.core.notary import PendingAttestation, BitcoinBlockHeaderAttestation

LIMIT = 131072

def decode(value):
    raw = base64.b64decode(value, validate=True)
    if len(raw) > LIMIT:
        raise ValueError("proof too large")
    return raw

def walk(node):
    yield node
    for child in node.ops.values():
        yield from walk(child)

def codec(data):
    digest = bytes.fromhex(data["digest"])
    if len(digest) != 32:
        raise ValueError("invalid SHA256 digest")
    if data.get("proof"):
        detached = DetachedTimestampFile.deserialize(BytesDeserializationContext(decode(data["proof"])))
        if type(detached.file_hash_op) is not OpSHA256 or detached.file_digest != digest:
            raise ValueError("proof does not match receipt")
    else:
        detached = DetachedTimestampFile(OpSHA256(), Timestamp(digest))
    additions = data.get("additions", [])
    if not isinstance(additions, list) or len(additions) > 4:
        raise ValueError("invalid additions")
    for addition in additions:
        commitment = bytes.fromhex(addition["commitment"])
        targets = [node for node in walk(detached.timestamp) if node.msg == commitment]
        if not targets:
            raise ValueError("unknown commitment")
        ctx = BytesDeserializationContext(decode(addition["timestamp"]))
        added = Timestamp.deserialize(ctx, commitment, _recursion_limit=128)
        ctx.assert_eof()
        for target in targets:
            target.merge(added)
    pending, bitcoin = [], []
    for message, attestation in detached.timestamp.all_attestations():
        if type(attestation) is PendingAttestation:
            pending.append({"commitment": message.hex(), "calendar": attestation.uri})
        elif type(attestation) is BitcoinBlockHeaderAttestation:
            bitcoin.append({"commitment": message.hex(), "height": attestation.height})
    if not pending and not bitcoin:
        raise ValueError("no usable attestation")
    ctx = BytesSerializationContext()
    detached.serialize(ctx)
    result = ctx.getbytes()
    if len(result) > LIMIT:
        raise ValueError("proof too large")
    return {"proof": base64.b64encode(result).decode("ascii"), "pending": pending, "bitcoin": bitcoin}

if __name__ == "__main__":
    try:
        raw = sys.stdin.buffer.read(1048577)
        if len(raw) > 1048576:
            raise ValueError("request too large")
        print(json.dumps(codec(json.loads(raw))))
    except Exception:
        # Do not echo private receipts or external proof contents into logs.
        print(json.dumps({"error": "INVALID_TIMESTAMP_PROOF"}))
        sys.exit(1)
