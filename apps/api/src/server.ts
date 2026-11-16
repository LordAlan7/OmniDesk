import { createApp } from './app';
import { env } from './config/env';

const app = createApp();
app.listen(env.port, () => {
  console.log(`OmniDesk API listening on http://localhost:${env.port}/api/v1 (${env.nodeEnv})`);
  if (env.seedDemoData) {
    console.log('Demo users: employee@, technician@, advisor@, manager@, admin@company.com  /  ChangeMe123!');
  }
});
