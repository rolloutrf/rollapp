tolk 1.5.0

// Testnet pilot. No administrator, personal data, token or withdrawal method.
// A registry's address is its stable identifier after initial deployment.
struct RecoveryRequest { nextOwner: address; executableAt: uint32; }
struct Authority { owner: address; recovery: address; pending: Cell<RecoveryRequest>?; }
struct Registry { cardId: uint256; revision: uint32; contentHash: uint256; authority: Cell<Authority>; }

const UPDATE = 0x43415201
const ROTATE = 0x43415202
const RECOVER = 0x43415203
const CANCEL_RECOVERY = 0x43415204
const EXECUTE_RECOVERY = 0x43415205
const RECOVERY_DELAY = 604800  // seven days

fun onInternalMessage(in: InMessage) {
    var body = in.body;
    if (body.isEmpty()) { return; }
    val op = body.loadUint(32);
    var st = Registry.fromCell(contract.getData());
    var auth = st.authority.load();
    if (op == UPDATE) {
        assert (in.senderAddress == auth.owner) throw 401;
        val nextRevision = body.loadUint(32);
        val nextHash = body.loadUint(256);
        body.assertEnd();
        assert (st.revision < 0xffffffff && nextRevision == st.revision + 1) throw 409;
        assert (nextHash != 0) throw 422;
        st.revision = nextRevision;
        st.contentHash = nextHash;
    } else if (op == ROTATE) {
        assert (in.senderAddress == auth.owner) throw 401;
        val nextOwner = body.loadAddress();
        val nextRecovery = body.loadAddress();
        body.assertEnd();
        assert (nextOwner != nextRecovery) throw 422;
        auth.owner = nextOwner;
        auth.recovery = nextRecovery;
        auth.pending = null;
    } else if (op == RECOVER) {
        assert (in.senderAddress == auth.recovery) throw 401;
        val nextOwner = body.loadAddress();
        body.assertEnd();
        assert (auth.pending == null) throw 409;
        assert (nextOwner != auth.recovery && nextOwner != auth.owner) throw 422;
        auth.pending = RecoveryRequest { nextOwner, executableAt: blockchain.now() + RECOVERY_DELAY }.toCell();
    } else if (op == CANCEL_RECOVERY) {
        assert (in.senderAddress == auth.owner) throw 401;
        body.assertEnd();
        auth.pending = null;
    } else if (op == EXECUTE_RECOVERY) {
        assert (in.senderAddress == auth.recovery) throw 401;
        body.assertEnd();
        assert (auth.pending != null) throw 409;
        val request = auth.pending!.load();
        assert (blockchain.now() >= request.executableAt) throw 425;
        auth.owner = request.nextOwner;
        auth.pending = null;
    } else { throw 400; }
    st.authority = auth.toCell();
    contract.setData(st.toCell());
}

get fun get_card_state(): (int, int, int, address, address, int) {
    val st = Registry.fromCell(contract.getData());
    val auth = st.authority.load();
    return (st.cardId, st.revision, st.contentHash, auth.owner, auth.recovery,
        auth.pending == null ? 0 : auth.pending!.load().executableAt);
}

get fun get_pending_recovery(): (address?, int) {
    val auth = Registry.fromCell(contract.getData()).authority.load();
    if (auth.pending == null) { return (null, 0); }
    val request = auth.pending!.load();
    return (request.nextOwner, request.executableAt);
}
