/* consigai/consig-cdk-jam#155: a Redis error in the registrar must never exit the process */
const test = require('tape');
const Registrar = require('../../lib/registrar');

const readonly = () => Object.assign(new Error('READONLY You can\'t write against a read only replica.'),
  {command: {name: 'zremrangebyscore'}});
/* every command rejects, as on the demoted primary */
const failingClient = () => new Proxy({}, {get: () => () => Promise.reject(readonly())});
const makeLogger = () => {
  const errors = [];
  const noop = () => {};
  return {errors, info: noop, debug: noop, error: (obj, msg) => errors.push({obj, msg})};
};

/* capture the registrar's 10-minute cleanup timer instead of scheduling it */
const withCapturedTimers = (fn) => {
  const timers = [];
  const setInterval = global.setInterval;
  global.setInterval = (cb, ms, ...args) => {
    timers.push({cb, ms, args});
    return {unref: () => {}};
  };
  try {
    return fn(timers);
  } finally {
    global.setInterval = setInterval;
  }
};

const unhandledDuring = async(fn) => {
  const seen = [];
  const listener = (reason) => seen.push(reason);
  process.on('unhandledRejection', listener);
  try {
    await fn();
    await new Promise((r) => setTimeout(r, 20));
  } finally {
    process.removeListener('unhandledRejection', listener);
  }
  return seen;
};

test('registrar: the cleanup timer handles a READONLY rejection', async(t) => {
  const logger = makeLogger();
  const timers = withCapturedTimers((timers) => {
    new Registrar(logger, failingClient());
    return timers;
  });
  t.equal(timers.length, 1, 'one cleanup timer');
  const unhandled = await unhandledDuring(() => timers[0].cb(...timers[0].args));
  t.equal(unhandled.length, 0, 'no unhandled rejection (api-server exited on this on Oct 31)');
  t.ok(logger.errors.some((e) => e.obj.err.message.startsWith('READONLY')), 'the error is logged');
  t.end();
});

test('registrar: getCountOfUsers rejects with a clear error instead of a TypeError', async(t) => {
  const registrar = withCapturedTimers(() => new Registrar(makeLogger(), failingClient()));
  const unhandled = await unhandledDuring(async() => {
    await registrar.getCountOfUsers().then(() => t.fail('resolved'), (err) => {
      t.notOk(err instanceof TypeError, 'not the Oct 31 TypeError (users.length of undefined)');
      t.match(err.message, /unable to read registered users/);
    });
  });
  t.equal(unhandled.length, 0);
  t.end();
});
