// Test-only TON Connect transport. Synthetic signing stays in the fixture server.
export default class TestWallet {
  onStatusChange(change, error) { this.change = change; this.error = error; window.walletTest.disconnect=()=>this.change?.(null); return () => { this.change = null; }; }
  async getWallets() { return [{ appName: 'tonkeeper', name: 'Test wallet', bridgeUrl: 'https://bridge.invalid', universalLink: 'https://wallet.invalid' }]; }
  connect(source, request, options) {
    if (!request?.tonProof || !options.signal) throw Error('Wrong SDK argument order');
    fetch('/__wallet/connect', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({payload:request.tonProof}), signal: options.signal })
      .then(response=>response.json()).then(wallet=>{if(window.walletTest.mode==='mainnet')wallet.account.chain='-239';this.change?.(wallet);}).catch(error=>this.error?.(error));
    return location.origin + '/__wallet/pending';
  }
  async signData(payload) {
    window.walletTest.signs++;
    if (window.walletTest.mode === 'reject') { const error = Error('rejected'); error.name = 'UserRejectsError'; throw error; }
    if (window.walletTest.mode === 'delay') await new Promise(resolve=>{window.walletTest.release=resolve;});
    const response = await fetch('/__wallet/sign', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({payload})});
    const result = await response.json();
    if (window.walletTest.mode === 'tamper') result.signature = 'A'.repeat(86) + '==';
    return result;
  }
  async sendTransaction(transaction) { window.walletTest.transactions.push(transaction); return {boc:'SYNTHETIC-NOT-BROADCAST'}; }
  async disconnect() { this.change?.(null); }
  pauseConnection() {}
}
