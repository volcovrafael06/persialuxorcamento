// static-build-config.js
// This file helps Cloudflare Pages understand how to handle your SPA

module.exports = {
  // Tell Cloudflare that this is a single-page application
  navigateFallback: '/index.html',
  
  // Ignore any asset requests (CSS, JS, images, etc.)
  navigateFallbackDenylist: [/\.\w+$/],
  
  // Disable Cloudflare's automatic JS security features
  // that might be causing the "lockdown-install.js" errors
  transform: {
    // Disable SES lockdown
    injectSESIntoWorkers: false
  }
};
