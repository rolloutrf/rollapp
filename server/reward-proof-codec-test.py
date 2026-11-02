import base64
import hashlib
import importlib.util
import unittest
from pathlib import Path
from opentimestamps.core.timestamp import Timestamp
from opentimestamps.core.notary import PendingAttestation, BitcoinBlockHeaderAttestation
from opentimestamps.core.serialize import BytesSerializationContext
from opentimestamps.core.op import OpAppend, OpSHA256

spec = importlib.util.spec_from_file_location('codec', Path(__file__).with_name('reward-proof-codec.py'))
codec = importlib.util.module_from_spec(spec)
spec.loader.exec_module(codec)

class CodecTests(unittest.TestCase):
    def timestamp(self, digest):
        node = Timestamp(bytes.fromhex(digest))
        node.attestations.add(PendingAttestation('https://alice.btc.calendar.opentimestamps.org'))
        return node

    def serialized(self, node):
        ctx = BytesSerializationContext()
        node.serialize(ctx)
        return base64.b64encode(ctx.getbytes()).decode()

    def test_pending_is_portable_and_bound_to_original_digest(self):
        digest = hashlib.sha256(b'private salted receipt').hexdigest()
        result = codec.codec({'digest': digest, 'additions': [{'commitment': digest, 'timestamp': self.serialized(self.timestamp(digest))}]})
        self.assertEqual(result['bitcoin'], [])
        self.assertEqual(result['pending'][0]['commitment'], digest)
        self.assertEqual(codec.codec({'digest': digest, 'proof': result['proof']}), result)
        with self.assertRaises(ValueError):
            codec.codec({'digest': 'ab'*32, 'proof': result['proof']})

    def test_appended_operations_are_executed_to_derive_bitcoin_commitment(self):
        digest = hashlib.sha256(b'receipt').hexdigest()
        node = Timestamp(bytes.fromhex(digest))
        end = node.ops.add(OpAppend(b'nonce')).ops.add(OpSHA256())
        end.attestations.add(BitcoinBlockHeaderAttestation(123))
        result = codec.codec({'digest': digest, 'additions': [{'commitment': digest, 'timestamp': self.serialized(node)}]})
        self.assertEqual(result['bitcoin'], [{'height': 123, 'commitment': hashlib.sha256(bytes.fromhex(digest)+b'nonce').hexdigest()}])

    def test_rejects_trailing_malformed_or_unknown_commitments(self):
        digest = 'ab'*32
        data = self.serialized(self.timestamp(digest))
        with self.assertRaises(Exception):
            codec.codec({'digest': digest, 'additions': [{'commitment': 'bc'*32, 'timestamp': data}]})
        with self.assertRaises(Exception):
            codec.codec({'digest': digest, 'additions': [{'commitment': digest, 'timestamp': base64.b64encode(base64.b64decode(data)+b'x').decode()}]})
        with self.assertRaises(Exception):
            codec.codec({'digest': digest, 'proof': 'not-base64'})

if __name__ == '__main__':
    unittest.main()
