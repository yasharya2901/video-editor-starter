const fs = require("node:fs/promises");

const util = {};

util.deleteFile = async (path) => {
    try {
        await fs.unlink(path)
    } catch (error) {
        // do nothing
    }
}

util.deleteFolder = async (path) => {
    try {
        await fs.rm(path, {recursive: true});
    } catch (error) {
        // do nothing
    }
};


module.exports = util;