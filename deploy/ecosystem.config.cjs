module.exports = {
  apps: [
    {
      name: 'switcheats-api',
      cwd: './Backend',
      script: 'server.js',
      instances: 'max',
      exec_mode: 'cluster',
      autorestart: true,
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'production',
        PORT: 5000,
        SOCKET_PORT: 5001,
        SERVER_BACKGROUND_JOBS_ENABLED: 'false',
        SERVER_QUEUE_BOOTSTRAP_ENABLED: 'false'
      }
    },
    {
      name: 'switcheats-socket',
      cwd: './Backend',
      script: 'socket-server.js',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      max_memory_restart: '350M',
      env: {
        NODE_ENV: 'production',
        SOCKET_PORT: 5001
      }
    },
    {
      name: 'switcheats-scheduler',
      cwd: './Backend',
      script: 'scripts/run-scheduled-jobs.js',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      max_memory_restart: '300M',
      env: {
        NODE_ENV: 'production'
      }
    },
    {
      name: 'switcheats-worker-otp',
      cwd: './Backend',
      script: 'src/queues/workers/otp.worker.js',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      max_memory_restart: '250M',
      env: {
        NODE_ENV: 'production'
      }
    },
    {
      name: 'switcheats-worker-notification',
      cwd: './Backend',
      script: 'src/queues/workers/notification.worker.js',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      max_memory_restart: '250M',
      env: {
        NODE_ENV: 'production'
      }
    },
    {
      name: 'switcheats-worker-order',
      cwd: './Backend',
      script: 'src/queues/workers/order.worker.js',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      max_memory_restart: '350M',
      env: {
        NODE_ENV: 'production'
      }
    },
    {
      name: 'switcheats-worker-tracking',
      cwd: './Backend',
      script: 'src/queues/workers/tracking.worker.js',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      max_memory_restart: '350M',
      env: {
        NODE_ENV: 'production'
      }
    },
    {
      name: 'switcheats-worker-payment',
      cwd: './Backend',
      script: 'src/queues/workers/payment.worker.js',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      max_memory_restart: '250M',
      env: {
        NODE_ENV: 'production'
      }
    },
    {
      name: 'switcheats-worker-maintenance',
      cwd: './Backend',
      script: 'src/queues/workers/maintenance.worker.js',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      max_memory_restart: '250M',
      env: {
        NODE_ENV: 'production'
      }
    }
  ]
};
