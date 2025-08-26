module.exports = {
  apps: [{
    name: 'dokumenta-portal',
    script: './backend/index.js',
    cwd: '/var/www/dokumenta',
    env: {
      NODE_ENV: 'production',
      PORT: 3001,
      JWT_SECRET: 'supersecretkey',
      DB_HOST: 'localhost',
      DB_USER: 'dokumenta_app',
      DB_PASSWORD: 'DokPortal2025!',
      DB_NAME: 'dokumenta_portal'
    }
  }]
};
