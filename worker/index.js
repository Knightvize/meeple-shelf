import cron from 'node-cron';
import { runJob } from './job.js';
cron.schedule('0 * * * *', () => runJob().catch(console.error)); // hourly
runJob().catch(console.error);
