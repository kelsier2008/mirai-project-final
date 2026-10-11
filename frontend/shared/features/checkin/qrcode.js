// The rotating check-in QR is drawn with qrcodejs 1.0.0 from cdnjs. It is loaded only
// when a live session is shown, and the browser checks it against this hash first.
const QR_SRC='https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js';
const QR_SRI='sha512-CNgIRecGo7nphbeZ04Sc13ka07paqdeTu0WR1IM4kNcpmBAUSHSQX0FslNhTDadL4O5SAGapGt4FodqL8My0mA==';
let pending=null;
export function loadQRCode(){if(window.QRCode)return Promise.resolve(window.QRCode);
 return pending??=new Promise((resolve,reject)=>{const s=document.createElement('script');s.src=QR_SRC;s.integrity=QR_SRI;s.crossOrigin='anonymous';s.referrerPolicy='no-referrer';
  s.onload=()=>window.QRCode?resolve(window.QRCode):reject(new Error('The QR code library did not load.'));
  s.onerror=()=>{pending=null;s.remove();reject(new Error('Could not load the QR code library. Students can still type the session ID and code shown here.'))};
  document.head.append(s)})}
