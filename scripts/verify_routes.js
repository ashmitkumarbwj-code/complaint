const app = require('../server'); 

function print(path, layer) {
  if (layer.route) {
    layer.route.stack.forEach(print.bind(null, path.concat(split(layer.route.path))))
  } else if (layer.name === 'router' && layer.handle.stack) {
    layer.handle.stack.forEach(print.bind(null, path.concat(split(layer.regexp))))
  } else if (layer.method) {
    console.log('%s /%s',
      layer.method.toUpperCase().padEnd(10),
      path.concat(split(layer.regexp)).filter(Boolean).join('/'))
  }
}

function split(thing) {
  if (typeof thing === 'string') {
    return thing.split('/')
  } else if (thing.fast_slash || thing.fast_star) {
    return ''
  } else {
    var b = thing.toString().replace(/[\\^$]/g, '')
      .replace(/\\\//g, '/')
      .replace(/\(\?:\(\[\^\\\/]\+\?\)\)/g, ':id')
      .replace(/\/\?\(\?=\/\|\$\)/g, '')
      .replace(/i$/, '')
    return b.split('/')
  }
}

console.log('--- REGISTERED ROUTES ---');
app._router.stack.forEach(print.bind(null, []));
process.exit(0);
