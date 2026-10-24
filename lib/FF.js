const {spawn} = require("node:child_process");
const {once} = require("node:events");

const makeThumbnail = async (fullPath, thumbnailPath) => {
    // ffmpeg -i video.mp4 -ss 5 -vframes 1 thumbnail.jpg
    const ffmepg = spawn("ffmpeg", ["-i", fullPath, "-ss", "2", "-vframes", "1", thumbnailPath]);

    
    const [code] = await once(ffmepg, "close");
    if (code !== 0) throw new Error(`FFMpeg exited with error code: ${code}`);
}

const getDimensions = async (fullPath) => {
    // ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=p=0 video.mp4
    
    const ffprobeSubprocess = spawn("ffprobe", [
        "-v", 
        "error", 
        "-select_streams", 
        "v:0", 
        "-show_entries", 
        "stream=width,height", 
        "-of", 
        "csv=p=0", 
        fullPath]);
    let dims = "";
    ffprobeSubprocess.stdout.on("data", (data) => {
        dims += data.toString("utf8");
    })
    
    const [code] = await once(ffprobeSubprocess, "close");
    if (code !== 0) throw new Error(`ffprobe exited with error code: ${code}`);

    const [width, height] = dims.trim().split(",");
    return {
        width: Number(width),
        height: Number(height)
    }
}

module.exports = {makeThumbnail, getDimensions};