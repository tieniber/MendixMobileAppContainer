document.addEventListener("deviceready", function() {

    mxMobile.enableConnectionDetection();
	mxMobile.enableSamlLogin();
    mxMobile.overrideConnectionError();
    /*mxMobile.errorHandler(function(message) {
        if (message.indexOf("Unable to load") != -1) {
             return false;
        }
        return true;
    });*/

});
