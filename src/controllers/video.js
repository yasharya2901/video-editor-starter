const path = require("node:path");
const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const {pipeline} = require("node:stream/promises");
const util = require("../../lib/util");
const DB = require("../DB");
const FF = require("../../lib/FF");
const JobQueue = require("../../lib/JobQueue");
const cluster = require("node:cluster");

let jobs;
if (cluster.isPrimary) {
    jobs = new JobQueue();
}

const getVideos = (req, res, handleErr) => {
    DB.update();
    const videos = DB.videos.filter((video) => {
        return video.userId === req.userId;
    })

    res.status(200).json(videos);
}


const uploadVideo = async (req, res, handleErr) => {
    const specifiedFileName = req.headers.filename;
    const extension = path.extname(specifiedFileName).substring(1).toLowerCase();
    const fileName = path.parse(specifiedFileName).name;
    const videoId = crypto.randomBytes(4).toString("hex");
    try {
        await fs.mkdir(`./storage/${videoId}`);
        const fullPath = `./storage/${videoId}/original.${extension}`;
    
        const file = await fs.open(fullPath, "w");
        const fileStream = file.createWriteStream();

        const thumbnailPath = `./storage/${videoId}/thumbnail.jpg`;
    
        await pipeline(req, fileStream);

        // Make a thumbnail for the video
        await FF.makeThumbnail(fullPath, thumbnailPath);
        
        // Get the dimensions
        const dimensions = await FF.getDimensions(fullPath);
        
        DB.update();
        DB.videos.unshift({
            id: DB.videos.length,
            videoId,
            name: fileName,
            extension,
            dimensions,
            userId: req.userId,
            extractedAudio: false,
            resizes: {}
        })
    
        DB.save();
    
        res.status(201).json({
            status: "success",
            message: "The file was uploaded successfully!"
        })
    } catch (error) {
        util.deleteFolder(`./storage/${videoId}`);
        if (error.code !== "ECONNRESET") return handleErr(error);
    }

}


const getVideoAsset = async (req, res, handleErr) => {
    const videoId = req.params.get("videoId");
    const type = req.params.get("type");

    DB.update();
    const video = DB.videos.find((video) => video.videoId === videoId);

    if (!video) {
        return handleErr({
            status: 404,
            message: "Video not found!"
        })
    }

    let file;
    let mimeType;
    let fileName;
    try {
    
        switch (type) {
            case "thumbnail":
                try {
                    file = await fs.open(`./storage/${video.videoId}/thumbnail.jpg`, "r");
                } catch (error) {
                    return handleErr({
                        status: 404,
                        message: error.message ?? "File not found!"
                    })
                }
                mimeType = "image/jpeg"
                break;
            
            case "audio":
                try {
                    file = await fs.open(`./storage/${videoId}/audio.aac`, "r");
                } catch (error) {
                    return handleErr({
                        status: 404,
                        message: error.message ?? "File not found!"
                    })
                }
                mimeType = "audio/aac"
                fileName = `${video.name}-audio.aac`;
                break;
                
            case "resize":
                const dimensions = req.params.get("dimensions");
                try {
                    file = await fs.open(`./storage/${videoId}/${dimensions}.${video.extension}`, "r");
                } catch (error) {
                    return handleErr({
                        status: 404,
                        message: error.message ?? "File not found!"
                    })
                }
                mimeType = "video/mp4"
                fileName = `${video.name}-${dimensions}.${video.extension}`;
                break;

            case "original":
                try {
                    file = await fs.open(`./storage/${videoId}/original.${video.extension}`, "r");
                } catch (error) {
                    return handleErr({
                        status: 404,
                        message: error.message ?? "File not found!"
                    })
                }
                mimeType = "video/mp4"
                fileName = `${video.name}.${video.extension}`;
                break;
        }
    
        const stat = await file.stat();
        const fileStream = file.createReadStream();
    
        res.setHeader("Content-Type", mimeType);
        if (type !== "thumbnail") {
            res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`); // To make the file downloadable
        }
        res.setHeader("Content-Length", stat.size);
        res.status(200);
        await pipeline(fileStream, res);
    } catch (error) {
        console.log(error)
        if (error.code === "ERR_STREAM_PREMATURE_CLOSE") return;
        return handleErr(error);
    } finally {
        file.close();
    }
}

const extractAudio = async (req, res, handleErr) => {
    const videoId = req.params.get("videoId");
    DB.update();

    const video = DB.videos.find((video) => video.videoId === videoId);
    if (!video) {
        return handleErr({
            status: 404,
            message: "Video not found"
        });
    }

    if (video.extractedAudio) {
        return handleErr({
            status: 400,
            message: "The audio has already been extracted for this video."
        });
    }
    const originalVideoPath = `./storage/${videoId}/original.${video.extension}`;
    const targetAudioPath = `./storage/${videoId}/audio.aac`;
    try {
        await FF.extractAudio(originalVideoPath, targetAudioPath);
        video.extractedAudio = true;
        DB.save();

        res.status(200).json({
            status: "success",
            message: "The audio was extracted successfully!"
        })
    } catch (error) {
        util.deleteFile(targetAudioPath);
        return handleErr(error);
    }
}

const resizeVideo = async (req, res, handleErr) => {
    const videoId = req.body.videoId;
    const width = Number(req.body.width);
    const height = Number(req.body.height);

    DB.update();

    const video = DB.videos.find((video) => video.videoId === videoId);
    video.resizes[`${width}x${height}`] = {processing: true};

    if (cluster.isPrimary) {
        jobs.enqueue({
            type: "resize",
            videoId,
            width,
            height,
        })
    } else {
        process.send({
            messageType: "new-resize",
            data: {videoId, width, height}
        });
    }

    res.status(200).json({
        status: "success",
        message: "The video is now being processed!"
    })
    
}


const controller = {
    getVideos,
    uploadVideo,
    getVideoAsset,
    extractAudio,
    resizeVideo,
}

module.exports = controller;