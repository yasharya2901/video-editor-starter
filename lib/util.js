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

util.sanitizeFileName = (name) => {
    // because content disposition header looks at comma with a separate value
    for (let i = 0; i < name.length; i++) {
        if (name[i] === ",") {
            name[i] = "-"
        }
    }
    return name;
}


module.exports = util;