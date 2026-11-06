const params = new URLSearchParams(location.search);
if (params.get('debug')) import('./debug.js').then((m) => m.runDebug(params.get('debug'), params));
else import('./app.js').then((m) => m.boot());
