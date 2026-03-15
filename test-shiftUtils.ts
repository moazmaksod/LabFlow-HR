import { getLogicalShiftDetails } from './server/utils/shiftUtils.js';

const schedule = {
    wednesday: [
        { start: '17:00', end: '05:00' } // 5 PM to 5 AM Thursday
    ]
};

// 2023-10-25 is a Wednesday.
// 2023-10-25T16:00:00 is 12 PM in NY.
// 2023-10-25T21:15:00Z is 5:15 PM in NY. (Checking in)
console.log(getLogicalShiftDetails(schedule, '2023-10-25T21:15:00Z', 'America/New_York', 'check_in'));

// 2023-10-26T09:00:00Z is 5:00 AM Thursday in NY. (Checking out)
console.log(getLogicalShiftDetails(schedule, '2023-10-26T09:00:00Z', 'America/New_York', 'check_out', '2023-10-25T21:15:00Z'));
