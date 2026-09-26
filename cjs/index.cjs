// cjs/index.cjs
let guardianPromise = import('../index.js');

module.exports = {
    init: (userConfig) => {
        guardianPromise.then(m => m.init(userConfig));
    },
    middleware: (req, res, next) => {
        guardianPromise.then(m => m.middleware(req, res, next));
    },
    isCritical: async () => {
        const m = await guardianPromise;
        return m.isCritical();
    }
};
да