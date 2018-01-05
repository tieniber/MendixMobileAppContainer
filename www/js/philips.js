document.addEventListener("deviceready", function() {
    navigator.splashscreen.hide();
	//(Un)comment the following line to turn on/off SAML login.
    registerSaml();
    overrideConnectionError();

    // waitForDojoConfig(function(){
    //     overrideOfflineSync();
    // });


    document.addEventListener("offline", onOffline, false);
    document.addEventListener("online", onOnline, false);

    var networkState = navigator.connection.type;
    if (networkState !== Connection.NONE) {
        onOnline();
    } else {
        onOffline();
    }
});

/*
 * This method overrides the default sync behavior so that file that are already on the filesystem are synced automatically
 */
function overrideOfflineSync(){
    var _downloadFileFn = window.dojoConfig.data.offlineBackend.downloadFileFn;
    var downloadDir;
    window.dojoConfig.data.offlineBackend.getStorageDirFn(
        function(dir) {
            downloadDir = dir.nativeURL;
        },
        function(err){

        }
    )
    window.dojoConfig.data.offlineBackend.downloadFileFn = function(src, dst, callback, error) {

        var target = downloadDir + "files/" + dst;

        window.resolveLocalFileSystemURL(target, function(){
            console.log("skippping: " + target);
            callback();
        }, function(){
            console.log("downloading: " + target);
            return _downloadFileFn(src, dst, callback, error);
        });

    }
}

function registerSaml() {

    waitFor(function() {
        return window.dojoConfig;
    }, function() {
        console.log("Configured SAML login")
        window.dojoConfig.ui.customLoginFn = samlLogin;
    }, function() {
        console.log("Could not override login");
    }, 180000, 50);

    var samlLogin = function() {
        console.log("Start SAML login");
        //var urlMatch = /www.bluecast.philips.com(\/?$|\/index-default.html)/;
        // debug: location=yes
        var samlWindow = cordova.InAppBrowser.open(mx.remoteUrl + "SSO/", "_blank", "location=no,toolbar=no");
        //debugger;
        var cb = function(event) {
            if (event.url.indexOf(mx.remoteUrl) == 0 && event.url.indexOf("SSO") == -1) {
            //if (urlMatch.test(event.url)) {
                console.log("User redirected to app")
                //make sure this is only called once
                samlWindow.removeEventListener("loadstop", cb);
                console.log("Removed event listener");

                samlWindow.executeScript({
                    code: "document.cookie;"
                }, function(values) {
                    console.log("Storing token");
                    var value = values[0] + ";";
                    var token = value.substring("AUTH_TOKEN_".length, value.indexOf(";"));
                    window.localStorage.setItem("mx-authtoken", token);

                    samlWindow.close();

                    if (window.mx.afterLoginAction) {
                        window.mx.afterLoginAction();
                    } else {
                        console.log("startup");
                    }

                });

            };
        };

        samlWindow.addEventListener("loadstop", cb);
    }
}

function overrideConnectionError() {
    var override = function() {
        if (mx) {


            console.log("Overriding mx.onError to create non-blocking connection errors");

            require([
                "mendix/lib/ConnectionError",
                "dojo/dom",
                "dojo/dom-class"
            ], function(ConnectionError, dom, domClass) {
                var oldError = mx.onError,
                    errorBarNode = dom.byId("error-bar"),
                    timeOut = null;

                setTimeout(function() {
                    domClass.toggle(errorBarNode, "closed", true);
                    domClass.toggle(errorBarNode, "hidden", false);
                }, 500);

                function showConnectionError(state) {
                    domClass.toggle(errorBarNode, "closed", !state);
                    domClass.toggle(errorBarNode, "open", state);
                }

                mx.onError = function(e) {
                    if (e && e instanceof ConnectionError) {
                        console.log("Connection error");
                        console.log(e);

                        showConnectionError(true);
                        if (timeOut) {
                            clearTimeout(timeOut);
                        }

                        timeOut = setTimeout(function() {
                            showConnectionError(false);
                            timeOut = null;
                        }, 2000);

                    } else {
                        oldError(e);
                    }
                };
            })


        } else {
            console.log("No MX");
        }
    }

    waitFor(function() {
        return typeof mx !== "undefined";
    }, function() {
        console.log("Adding connection error override to onLoad");
        mx.addOnLoad(override);
    }, function() {
        console.log("Could not override connectionerror");
    }, 60000, 10);

}

function onOnline() {
    var networkState = navigator.connection.type;
    var body = document.getElementsByTagName('body')[0];
    if (networkState !== Connection.NONE) {
        addClass(body, "status-online")
        removeClass(body, "status-offline")
    }
}

function onOffline() {
    var body = document.getElementsByTagName('body')[0];
    removeClass(body, "status-online")
    addClass(body, "status-offline")
}

/*
 *Helper methods
 */
function addClass(element, className) {
    //make sure no duplace classnames
    removeClass(element, className);
    element.className += ' ' + className;
}

function removeClass(element, className) {
    element.className = element.className.replace(
        new RegExp('( |^)' + className + '( |$)', 'g'), ' ').trim();
}

function waitForDojoConfig(fnCallback) {
    waitFor(function() {
        return window.dojoConfig;
    }, function() {
        console.log("dojoConfig available");
        fnCallback();
    }, function() {
        console.log("dojoConfig not created");
    }, 60000, 10);
}

function waitForMxClient(fnCallback) {
    waitFor(function() {
        return typeof mx !== "undefined";
    }, function() {
        console.log("Mendix client loaded");
        mx.addOnLoad(fnCallback);
    }, function() {
        console.log("Mendix client not loaded");
    }, 60000, 10);
}

function waitFor(fnCondition, succesCallback, errorCallBack, timeoutMs, interval) {
    var waitTime = 0;
    var id = setInterval(function() {
        waitTime += interval;
        if (waitTime > timeoutMs) {
            clearInterval(id);
            errorCallBack();
            return;
        }
        if (fnCondition()) {
            clearInterval(id);
            succesCallback();
            return;
        }
    }, interval);
}
