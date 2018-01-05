if (!window.mxMobile) {
    window.mxMobile = {};
}
/*
 * The log error function determines whether the error should be send to the Mendix server based on the error message which is passed as the argument
 */
mxMobile.errorHandler = function(logErrorFunction) {
    var queue = [];
    var processing = false;
    var WAIT_RETRY = 5000;
    var NR_RETRIES = 5;

    var process = function() {
        if (processing) {
            return;
        }
        if (queue.length > 0) {
            processing = true;
            send(queue[0], function() {
                queue.shift();
                processing = false;
                process();
            }, function() {
                processing = false;
                queue[0].attempts = queue[0].attempts + 1;
                if(queue[0].attempts > NR_RETRIES){
                    queue.shift();
                    process();
                }else{
                    setTimeout(process, WAIT_RETRY);
                }
            })
        } else {
            processing = false;
        }
    }

    var addtoQueue = function(errorObject) {
        if(!errorObject.attempts){
            errorObject.attempts = 1;
        }
        queue.push(errorObject);
        process();
    }

    var send = function(errorObject, successCallback, errorCallBack) {
        if (typeof mx == 'undefined') {
            console.log("mx is undefined");
            return;
        }
        console.log("Sending: " + JSON.stringify(errorObject));

        function reqListener() {
            if (this.readyState == 0) {
                errorCallBack();
            }
            if (this.readyState == 4) {
                if (this.status == 200) {
                    successCallback();
                } else if (this.status > 400) {
                    errorCallBack();
                }
            }
        }

        var xhr = new XMLHttpRequest();
        xhr.timeout = 5000;
        xhr.open("POST", mx.appUrl + "/mobileerrors/", true);
        xhr.addEventListener("load", reqListener);
        xhr.addEventListener("error", errorCallBack);
        xhr.addEventListener("timeout", errorCallBack);
        xhr.setRequestHeader("Content-type", "application/json");
        xhr.send(JSON.stringify(errorObject));
    }

    var addError = function(error) {

        var errorMessage = "";
        if (error.message) {
            errorMessage = error.message;
        } else {
            errorMessage = error;
        }
        if (logErrorFunction) {
            if (!logErrorFunction(errorMessage)) {
                //console.log("Ignoring " + errorMessage);
                return;
            }
        }

        var errorObject = {
            error: errorMessage
        };

        if (navigator.connection && typeof Connection !== "undefined") {
            errorObject.networkState = navigator.connection.type;
        }

        if (window.device) {
            errorObject.platform = window.device.platform;
            errorObject.manufacturer = window.device.manufacturer;
            errorObject.model = window.device.model;
            errorObject.osVersion = window.device.version;
        }

        if (typeof mx != 'undefined') {
            errorObject.username = mx.session.getUserName();
            if (mx.router._contentForm) {
                errorObject.currentPage = mx.router._contentForm.path.replace(".page.xml", "");
            }
        }

        if (cordova.getAppVersion) {
            cordova.getAppVersion()
                .then(function(version) {
                    errorObject.appVersion = version;
                    sendError(errorObject);
                })
                .fail(function(){
                    sendError(errorObject);
                });
        } else {
            sendError(errorObject);
        }

        var sendError = function(errorObject) {
            send(errorObject, function success() {
                //directly sent
            }, function err() {
                console.log("Could not immediately send error object");
                window.setTimeout(function(){
                    addtoQueue(errorObject);
                }, WAIT_RETRY);
            });
        }
    }

    console.log("Overriding console.error for error logging")
    console._error = console.error;
    console.error = function(err) {
        console._error(err);
        addError(err);
    };

}

/*
 * This method overrides the connection errors by showing a bar for 2 seconds in the top of the screen.
 * The HTML and CSS must be added to the index.html manually: TODO: make this automated by injecting the HTML
 */
mxMobile.overrideConnectionError = function() {

    console.log("Overriding mx.onError to create non-blocking connection errors");

    var override = function() {

        require([
            "mendix/lib/ConnectionError",
            "dojo/dom",
            "dojo/dom-class"
        ], function(ConnectionError, dom, domClass) {
            var oldError = mx.onError,
                errorBarNode = dom.byId("error-bar"),
                timeOut = null;

            if (!errorBarNode) {
                alert("Could not find the error bar html");
            }

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
        });
    }
    mxMobile.waitForMxClient(override);

}

/*
 * This method overrides the default sync behavior so that file that are already on the filesystem are synced automatically
 */
mxMobile.overrideOfflineSync = function() {

        var override = function() {
            var _downloadFileFn = window.dojoConfig.data.offlineBackend.downloadFileFn;
            var downloadDir;
            window.dojoConfig.data.offlineBackend.getStorageDirFn(
                function(dir) {
                    downloadDir = dir.nativeURL;
                },
                function(err) {}
            )
            window.dojoConfig.data.offlineBackend.downloadFileFn = function(src, dst, callback, error) {

                var target = downloadDir + "files/" + dst;

                window.resolveLocalFileSystemURL(target, function() {
                    console.log("skippping: " + target);
                    callback();
                }, function() {
                    console.log("downloading: " + target);
                    return _downloadFileFn(src, dst, callback, error);
                });

            }
        }
        mxMobile.waitForDojoConfig(override);
    }
    /*
     * This method enables SAML2 login. This also requires changes to the SAML module!
     */
mxMobile.enableSamlLogin = function() {
    var register = function() {
        var samlLogin = function() {
            console.log("Start SAML login");
            var samlWindow = cordova.InAppBrowser.open(window.mx.remoteUrl + "SSO/", "_blank", "location=no,toolbar=no");
            var exitFn = function(){
                navigator.app.exitApp();
            };
            samlWindow.addEventListener("exit", exitFn);
            var cb = function(event) {
                if (event.url.indexOf(window.mx.remoteUrl) == 0 && event.url.indexOf("SSO") == -1) {

                    console.log("User redirected to app")

                    samlWindow.removeEventListener("loadstop", cb);
                    samlWindow.removeEventListener("exit", exitFn);

                    samlWindow.executeScript({
                        code: "document.cookie;"
                    }, function(values) {
                        var value = values[0] + ";";

                        var token = new RegExp('AUTH_TOKEN=([^;]+);', 'g').exec(value)[1];
                        window.localStorage.setItem("mx-authtoken", token);

                        console.log("Closing window")
                        samlWindow.close();

                        if (window.mx.afterLoginAction) {
                            window.mx.afterLoginAction();
                        } else {
                            console.log("startup");
                        }

                    });

                };
            }
            samlWindow.addEventListener("loadstop", cb);
        }
        window.dojoConfig.ui.customLoginFn = samlLogin;
    }
    mxMobile.waitForDojoConfig(register);
}

/*
 * This method detects whether the device is online or offline and add respectively the classes status-online and status-offline to the body
 */
mxMobile.enableConnectionDetection = function() {
    function onOnline() {
        var networkState = navigator.connection.type;
        var body = document.getElementsByTagName('body')[0];
        if (networkState !== Connection.NONE) {
            mxMobile.addClass(body, "status-online")
            mxMobile.removeClass(body, "status-offline")
        }
    }

    function onOffline() {
        var body = document.getElementsByTagName('body')[0];
        mxMobile.removeClass(body, "status-online")
        mxMobile.addClass(body, "status-offline")
    }
    if (navigator.connection && typeof Connection !== "undefined") {
        document.addEventListener("offline", onOffline, false);
        document.addEventListener("online", onOnline, false);

        var networkState = navigator.connection.type;
        if (networkState !== Connection.NONE) {
            onOnline();
        } else {
            onOffline();
        }
    }
}


/*
 *Helper methods
 */
mxMobile.addClass = function(element, className) {
    //make sure no duplace classnames
    mxMobile.removeClass(element, className);
    element.className += ' ' + className;
}

mxMobile.removeClass = function(element, className) {
    element.className = element.className.replace(
        new RegExp('( |^)' + className + '( |$)', 'g'), ' ').trim();
}

mxMobile.waitFor = function(fnCondition, succesCallback, errorCallBack, timeoutMs, interval) {
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

mxMobile.waitForDojoConfig = function(fnCallback) {
    mxMobile.waitFor(function() {
        return window.dojoConfig;
    }, function() {
        console.log("dojoConfig available");
        fnCallback();
    }, function() {
        console.log("dojoConfig not created");
    }, 120000, 50);
}

mxMobile.waitForMxClient = function(fnCallback) {
    mxMobile.waitFor(function() {
        return typeof mx !== "undefined";
    }, function() {
        console.log("Mendix client loaded");
        mx.addOnLoad(fnCallback);
    }, function() {
        console.log("Mendix client not loaded");
    }, 120000, 50);
}
