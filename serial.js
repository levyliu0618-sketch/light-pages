'use strict';
// Deliberately separate transport from presentation. No bare numeric commands.
class LightPagesSerial {
  constructor(onState, onMode) {
    this.onState=onState; this.onMode=onMode; this.port=null; this.reader=null;
    this.writer=null; this.ready=false; this.pending=new Set(); this.sequence=0;
    this.heartbeat=null; this.lastSeen=0; this.closing=false; this.connecting=false;
    this.readTask=null; this.identified=false;
  }
  waitLine(test, ms) {
    return new Promise((resolve,reject)=>{
      const item={test,resolve,reject,timer:null};
      item.timer=setTimeout(()=>{this.pending.delete(item);reject(new Error('The board did not acknowledge the command.'));},ms);
      this.pending.add(item);
    });
  }
  receive(line) {
    if (!line) return;
    this.lastSeen=Date.now();
    for(const item of [...this.pending]) if(item.test(line)){
      clearTimeout(item.timer);this.pending.delete(item);item.resolve(line);
    }
    if(this.ready && line==='TIMEOUT,0') this.onMode('0','The board timed out and acknowledged outputs off. Select a light again.');
    if(this.ready && line.startsWith('ERR,')) void this.fail('The board rejected a command. Outputs were requested off.');
  }
  async readLoop() {
    let text=''; const decoder=new TextDecoder(); const reader=this.reader;
    try {
      while(!this.closing && reader){
        const {value,done}=await reader.read(); if(done)break;
        text+=decoder.decode(value,{stream:true});
        let end;while((end=text.indexOf('\n'))>=0){this.receive(text.slice(0,end).replace(/\r$/,''));text=text.slice(end+1);}
        if(text.length>4096)throw new Error('Unexpected serial data.');
      }
    } catch(error) {
      if(!this.closing)setTimeout(()=>void this.fail('Arduino connection lost. No light output is confirmed.'),0);
    } finally {
      try{reader?.releaseLock();}catch{}
      if(this.reader===reader)this.reader=null;
      if(!this.closing && this.port)setTimeout(()=>void this.fail('Arduino connection closed. No light output is confirmed.'),0);
    }
  }
  async write(line) {
    if(!this.writer)throw new Error('No serial writer.');
    await this.writer.write(new TextEncoder().encode(line+'\n'));
  }
  async connect() {
    if(this.connecting||this.port)return;
    if(!navigator.serial)throw new Error('Open the local launcher in desktop Chrome for Arduino control.');
    this.connecting=true;this.closing=false;this.identified=false;
    this.onState('connecting','Choose your Arduino. Checking the two-light firmware…');
    let helloInterval;
    try {
      this.port=await navigator.serial.requestPort();
      await this.port.open({baudRate:115200});
      this.writer=this.port.writable.getWriter();
      this.reader=this.port.readable.getReader();this.readTask=this.readLoop();
      const hello=this.waitLine(line=>line==='LP_LIGHTS_V2'||line==='LP_LIGHTS_V1',5500);
      // The UNO may reset when the port opens. Retry only this harmless query.
      const sayHello=()=>this.write('HELLO').catch(()=>{});
      await sayHello();helloInterval=setInterval(sayHello,650);
      const version=await hello;clearInterval(helloInterval);
      if(version!=='LP_LIGHTS_V2')throw new Error('OLD_FIRMWARE');
      this.identified=true;this.ready=true;
      await this.setMode('0');
      this.startHeartbeat();
      this.onState('connected','Board acknowledged both outputs off. Ready for the two-light demo.');
    } catch(error) {
      clearInterval(helloInterval);
      const message=error.name==='NotFoundError'?'No Arduino selected. Screen rehearsal is still available.':
        error.message==='OLD_FIRMWARE'?'Your board has V1. Upload LightPages_TwoLights V2 to enable both lights in Compare, then reconnect.':
        !this.identified?'Could not verify V2 firmware. Upload LightPages_TwoLights V2, close Serial Monitor, then reconnect.':error.message;
      await this.close();this.onState('error',message);
    } finally{this.connecting=false;}
  }
  async setMode(mode) {
    if(!this.ready||!['A','B','C','0'].includes(mode))throw new Error('Arduino is not ready.');
    this.sequence=(this.sequence%65535)+1; const sequence=this.sequence;
    const ack=this.waitLine(line=>line===`ACK,${sequence},${mode}`,1600);
    // Attach the handler immediately so a failed write cannot leave an unhandled timeout.
    const settled=ack.then(()=>mode);
    try{await this.write(`SET,${sequence},${mode}`);return await settled;}
    catch(error){settled.catch(()=>{});throw error;}
  }
  startHeartbeat(){
    this.stopHeartbeat();this.lastSeen=Date.now();
    this.heartbeat=setInterval(()=>{
      if(!this.ready)return;
      if(Date.now()-this.lastSeen>2600){void this.fail('Arduino stopped responding. The board will switch its lights off after its timeout.');return;}
      void this.write('PING').catch(()=>this.fail('Could not reach Arduino. No physical output is confirmed.'));
    },700);
  }
  stopHeartbeat(){clearInterval(this.heartbeat);this.heartbeat=null;}
  async fail(message){
    if(this.closing||(!this.port&&!this.connecting))return;
    this.ready=false;
    // OFF is only sent after the firmware identity has been verified.
    if(this.identified&&this.writer)void this.write('OFF').catch(()=>{});
    await this.close();this.onState('error',message);
  }
  async disconnect(){
    let acknowledged=false;
    if(this.ready){try{await this.setMode('0');acknowledged=true;}catch{}}
    await this.close();
    this.onState('disconnected',acknowledged?'Board acknowledged both outputs off. Screen rehearsal is active.':'Disconnected. Physical output was not confirmed; allow the board timeout or unplug USB.');
  }
  async close(){
    this.closing=true;this.ready=false;this.stopHeartbeat();
    for(const item of this.pending){clearTimeout(item.timer);item.reject(new Error('Serial connection closed.'));}this.pending.clear();
    try{await this.reader?.cancel();}catch{}
    try{await this.readTask;}catch{}
    try{this.writer?.releaseLock();}catch{}
    this.writer=null;this.reader=null;
    try{await this.port?.close();}catch{}
    this.port=null;this.identified=false;this.connecting=false;
  }
}
window.LightPagesSerial=LightPagesSerial;
