// This is a configuration helper for Cloudflare Pages builds
module.exports = {
  webpack: (config, options) => {
    // Disable SES lockdown to prevent "Removing unpermitted intrinsics" warnings
    config.ignoreWarnings = [
      /Removing unpermitted intrinsics/,
    ];
    
    return config;
  },
};
