// Applies the saved light/dark choice before the page paints (no flash). Falls back to the system setting.
(function () {
    try {
        var t = localStorage.getItem('nn-theme');
        if (t === 'dark' || t === 'light') document.documentElement.setAttribute('data-theme', t);
    } catch (e) { /* storage blocked: use the system setting */ }
})();
