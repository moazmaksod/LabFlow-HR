import db from './server/db/index.js';
const reqs = db.prepare("SELECT * FROM requests WHERE type = 'overtime_approval'").all() as any[];
console.log("Requests:");
console.log(reqs);

const atts = db.prepare("SELECT * FROM attendance").all() as any[];
console.log("Attendance:");
console.log(atts);
