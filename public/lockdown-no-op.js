// This is a replacement for Cloudflare's lockdown-install.js that causes errors
// It does nothing but prevents the error messages in the console

(function() {
  console.log('SES lockdown disabled by lockdown-no-op.js');
  
  // Define a no-op function that will be used in place of the real lockdown functionality
  window.lockdown = function() {
    return { errorTaming: 'unsafe', consoleTaming: 'unsafe' };
  };
  
  // Define the Compartment constructor if needed
  if (typeof Compartment === 'undefined') {
    window.Compartment = function(endowments) {
      return {
        evaluate: function(sourceText) {
          return (new Function(sourceText))();
        }
      };
    };
  }
})();
