// Registers the offline service worker (not when the app is shown inside emevidence.org).
if ('serviceWorker' in navigator && window.top === window.self) {
    window.addEventListener('load', function () {
        navigator.serviceWorker.register('sw.js').catch(function () { /* offline support is optional */ });
    });
}
