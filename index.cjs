const path = require("path")
let guardianPromise = import(path.join(__dirname, '..", "index.js'));

module.exports = {
    init: (userConfig) => {
        guardianPromise.then(m => m.init(userConfig));
    },
    middleware: (req, res, next) => {
        guardianPromise.then(m => m.middleware(req, res, next)).catch(next);
    },
    isCritical: async () => {
        const m = await guardianPromise;
        return m.isCritical();
    },
    destroy: () => {
        guardianPromise.then(m => m.destroy());
    }
};