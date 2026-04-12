const req = {
    details: undefined
};

const requestedMinutes = req.details ? JSON.parse(req.details).requested_overtime_minutes : 0;
const approved_minutes = undefined;
const status = 'rejected';

const minutes = status === 'approved' ? (approved_minutes !== undefined ? approved_minutes : requestedMinutes) : requestedMinutes;
const hours = minutes / 60;
console.log('minutes:', minutes);
console.log('hours:', hours);
