(function () {
    var rootEl = document.documentElement;

    function $(v, c) {
        return (c || document).querySelector(v);
    }

    function $$(v, c) {
        return [].slice.call((c || document).querySelectorAll(v));
    }

    function addClass(className, el) {
        var classList = className.match(/\b[^\s]+\b/g) || [];

        classList.forEach(function (cls) {
            (el || rootEl).classList.add(cls);
        });
    }

    function removeClass(className, el) {
        var classList = className.match(/\b[^\s]+\b/g) || [];

        classList.forEach(function (cls) {
            (el || rootEl).classList.remove(cls);
        });
    }

    function loading() {
        var themeCls = 'prism-pretty-' + global_options.theme;
        addClass('prism-pretty prism-pretty-spinner ' + themeCls);
    }

    function unloading() {
        var themeCls = 'prism-pretty-' + global_options.theme;
        removeClass('prism-pretty prism-pretty-spinner' + themeCls);
    }

    function execScript(content) {
        var script = document.createElement('script');

        script.textContent = 'try{' + content + '}catch(e){}';

        document.head.appendChild(script);
        script.remove(); script = null;
    }

    function detectCSS(content) {
        var type;
        var style = document.createElement('style');

        style.textContent = content;

        document.head.appendChild(style);

        if (style.sheet.rules.length) {
            type = 'css';
        }

        style.remove();
        style = null;

        return type;
    }

    function getEntireHtml() {
        var docType = new XMLSerializer().serializeToString(document.doctype);
        return docType + '\n' + rootEl.outerHTML;
    }

    var global_options, global_headers;
    var promises = [
        (function () {
            return new Promise(function (resolve, reject) {
                chrome.runtime.sendMessage({
                    action: 'requestHeaders'
                }, function (headers) {
                    global_headers = headers;

                    if (global_options.enabled) {
                        if (headers.type == 'markdown') {
                            global_options.theme = 'markdown';
                        }

                        if (headers.type) {
                            loading();
                        }
                        resolve(headers);
                    } else {
                        reject();
                    }
                });
            });
        }),

        (function () {
            return new Promise(function (resolve) {
                if (/te/.test(document.readyState)) {
                    resolve();
                } else {
                    document.addEventListener('DOMContentLoaded', resolve);
                }
            });
        })
    ];

    var app = {
        init: function () {
            var self = this;

            chrome.storage.sync.get(function (options) {
                global_options = options;

                Promise.all(promises.map(function (p) {
                    return p();
                })).then(function () {
                    rootEl = document.documentElement;

                    if (!self.prettifyContent()) {
                        unloading();
                    }
                });
            });

            chrome.storage.onChanged.addListener(function () {
                if (rootEl.classList.contains('prism-pretty')) {
                    location.reload();
                }
            });

            chrome.runtime.onMessage.addListener(function (request) {
                var action = request.action;

                if (action == 'prettyDocument') {
                    if (rootEl.classList.contains('prism-pretty')) {
                        location.reload();
                        return;
                    }

                    // pretty html
                    self.sendPrettyMsg('html', '');
                }
            });
        },

        loadFont: function () {
            var style = document.createElement('style');
            var srcUrl = chrome.runtime.getURL('css/droid-sans-mono.woff2');

            style.textContent = (function () {/*
             @font-face {
                 font-family: 'Droid Sans Mono';
                 font-style: normal;
                 font-weight: 400;
                 src: local('Droid Sans Mono'), local('DroidSansMono'), url('srcUrl') format('woff2');
                 unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02C6, U+02DA, U+02DC, U+2000-206F, U+2074, U+20AC, U+2212, U+2215, U+E0FF, U+EFFD, U+F000;
             }
             */}).toString().slice(14, -4).replace('srcUrl', srcUrl);

            document.head.appendChild(style);
        },

        prettifyContent: function () {
            var content;
            var body = document.body;
            var children = body.children;
            var pre = children[0];

            if (children.length == 0) {
                content = body.textContent;
            }

            if (children.length == 1 && pre.nodeName == 'PRE') {
                content = pre.textContent;
            }

            if (!content) {
                return;
            }

            var type = global_headers.type;

            if (!type) {
                try {
                    JSON.parse(content);
                    type = 'json';
                } catch(e) {
                    try {
                        esprima.parse(content);
                        type = 'js';

                        if (/^[\s\w]+\(\{/.test(content)) {
                            type = 'jsonp';
                        }
                    } catch(e) {
                        type = detectCSS(content);
                    }
                }
            }

            if (!type) {
                return;
            }

            var tmpType = type;
            var types = global_options.formatTypes;

            if (tmpType == 'json' || tmpType == 'jsonp') {
                tmpType = 'js';
            }

            // if type format is enabled
            if (!~types.indexOf(tmpType)) {
                return;
            }

            if (type == 'json' || type == 'jsonp') {
                var script = 'var json = ';

                if (type == 'json') {
                    script += content;
                }

                if (type == 'jsonp') {
                    script += '(' + content.replace(/\w+\(/, '');
                }

                script += ';console.log("%cvar json = ", "color:teal", json);';

                execScript(script);
            }

            this.sendPrettyMsg(type, content);

            return true;
        },

        sendPrettyMsg: function (type, content) {
            var self = this;
            var options = global_options;
            var headers = global_headers || {headers: []};

            loading();

            chrome.runtime.sendMessage({
                action: 'prettify',
                type: type,
                content: content,
                headers: headers.headers,
                options: options
            }, function (responseHtml) {
                if (!responseHtml) {
                    unloading();
                    return;
                }

                var title = document.title;
                var className = 'prism-pretty';

                className += ' pretty-theme-' + options.theme;
                className += ' pretty-size-' + options.fontSize;

                rootEl.innerHTML = '<head></head><body>' + responseHtml + '</body>';
                rootEl.className = className;

                if (title) {
                    document.title = 'Prism Pretty: ' + title;
                }

                // load Droid Sans font
                self.loadFont();

                var headerEl = $('.request-headers');

                if (headerEl) {
                    setTimeout(function () {
                        headerEl.style.cssText = 'opacity:0;-webkit-transition:0.5s ease-out;';
                    }, 3000);
                }

                if (type === 'markdown') {
                    var hash = location.hash.slice(1);
                    var anchors = $$('.anchor');
                    var anchor;

                    anchors.some(function (a) {
                        if (a.id == hash) {
                            anchor = a;
                            return true;
                        }
                    });

                    if (anchor) {
                        window.scrollTo(0, anchor.getBoundingClientRect().top - 10);
                    }
                }

                var wrap;

                if (wrap = $('.preview-wrap')) {
                    var script = $('script', wrap);

                    if (script) {
                        execScript(script.textContent);
                        script.remove();
                    }
                }
            });
        }
    };

    app.init();
}).call();
