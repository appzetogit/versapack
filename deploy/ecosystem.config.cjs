module.exports = {
  apps: [
    {
      name: 'versapack-api',
      cwd: './Backend',
      script: 'server.js',
      instances: 'max',
      exec_mode: 'cluster',
      autorestart: true,
      max_memory_restart: '500M',
      // PORT and SOCKET_PORT deliberately absent: PM2 puts whatever is here into
      // the environment before Node starts, and dotenv will not overwrite an
      // existing variable, so naming them here silently overrode the .env the
      // operator actually edited. That is how the API ended up on 5000 while
      // nginx proxied to the 5055 from .env -- a 502 with a healthy process
      // behind it. The .env is the single source of truth for ports.
      env: {
        NODE_ENV: 'production',
        SERVER_BACKGROUND_JOBS_ENABLED: 'false',
        SERVER_QUEUE_BOOTSTRAP_ENABLED: 'false'
      }
    },
    {
      name: 'versapack-socket',
      cwd: './Backend',
      script: 'socket-server.js',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      max_memory_restart: '350M',
      env: {
        NODE_ENV: 'production'
      }
    },
    {
      name: 'versapack-scheduler',
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
      name: 'versapack-worker-otp',
      cwd: './Backend',
      script: 'src/queues/workers/otp.worker.js',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      // A worker exits 0 on purpose when BULLMQ_ENABLED is false. Without this,
      // autorestart reads that as a crash and respawns it forever -- six processes
      // restarting every couple of seconds, which is what pinned the host CPU.
      stop_exit_codes: [0],
      max_memory_restart: '250M',
      env: {
        NODE_ENV: 'production'
      }
    },
    {
      name: 'versapack-worker-notification',
      cwd: './Backend',
      script: 'src/queues/workers/notification.worker.js',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      // A worker exits 0 on purpose when BULLMQ_ENABLED is false. Without this,
      // autorestart reads that as a crash and respawns it forever -- six processes
      // restarting every couple of seconds, which is what pinned the host CPU.
      stop_exit_codes: [0],
      max_memory_restart: '250M',
      env: {
        NODE_ENV: 'production'
      }
    },
    {
      name: 'versapack-worker-order',
      cwd: './Backend',
      script: 'src/queues/workers/order.worker.js',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      // A worker exits 0 on purpose when BULLMQ_ENABLED is false. Without this,
      // autorestart reads that as a crash and respawns it forever -- six processes
      // restarting every couple of seconds, which is what pinned the host CPU.
      stop_exit_codes: [0],
      max_memory_restart: '350M',
      env: {
        NODE_ENV: 'production'
      }
    },
    {
      name: 'versapack-worker-tracking',
      cwd: './Backend',
      script: 'src/queues/workers/tracking.worker.js',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      // A worker exits 0 on purpose when BULLMQ_ENABLED is false. Without this,
      // autorestart reads that as a crash and respawns it forever -- six processes
      // restarting every couple of seconds, which is what pinned the host CPU.
      stop_exit_codes: [0],
      max_memory_restart: '350M',
      env: {
        NODE_ENV: 'production'
      }
    },
    {
      name: 'versapack-worker-payment',
      cwd: './Backend',
      script: 'src/queues/workers/payment.worker.js',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      // A worker exits 0 on purpose when BULLMQ_ENABLED is false. Without this,
      // autorestart reads that as a crash and respawns it forever -- six processes
      // restarting every couple of seconds, which is what pinned the host CPU.
      stop_exit_codes: [0],
      max_memory_restart: '250M',
      env: {
        NODE_ENV: 'production'
      }
    },
    {
      name: 'versapack-worker-maintenance',
      cwd: './Backend',
      script: 'src/queues/workers/maintenance.worker.js',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      // A worker exits 0 on purpose when BULLMQ_ENABLED is false. Without this,
      // autorestart reads that as a crash and respawns it forever -- six processes
      // restarting every couple of seconds, which is what pinned the host CPU.
      stop_exit_codes: [0],
      max_memory_restart: '250M',
      env: {
        NODE_ENV: 'production'
      }
    }
  ]
};
