const DB = require("../src/DB");
const FF = require("./FF");
const util = require("./util");


class JobQueue {
    constructor() {
        this.jobs = [];
        this.currentJob = null;

        DB.videos.find((video) => {
            const resizes = video.resizes;
            Object.keys(resizes).forEach((key) => {
                if(resizes[key].processing) {
                    const [width, height] = key.split("x");
                    this.enqueue({
                        type: "resize",
                        videoId: video.videoId,
                        width: Number(width),
                        height: Number(height),
                    })
                }
            })
        })
    }

    enqueue(job) {
        this.jobs.push(job);
        this.executeNext();
    }

    dequeue() {
        return this.jobs.shift();
    }

    executeNext() {
        if (this.currentJob) return;
        this.currentJob = this.dequeue();
        if (!this.currentJob) return;
        this.execute(this.currentJob);
    }

    async execute(job) {
        // ffmpeg logic
        if (job.type === "resize") {
            DB.update();

            const video = DB.videos.find((video) => video.videoId === job.videoId);
            video.resizes[`${job.width}x${job.height}`] = {processing: true};
            DB.save();
            const originalVideoPath = `./storage/${video.videoId}/original.${video.extension}`;
            const targetVideoPath = `./storage/${video.videoId}/${job.width}x${job.height}.${video.extension}`;
            try {
                await FF.resize(originalVideoPath, targetVideoPath, job.width, job.height);
                DB.update();
                const video = DB.videos.find((video) => video.videoId === job.videoId);
                video.resizes[`${job.width}x${job.height}`].processing = false;
                DB.save();
        
                console.log("Done resizing! Number of jobs remaining:", this.jobs.length);
            } catch (error) {
                console.log(error);
                util.deleteFile(targetVideoPath);
            }
        }

        this.currentJob = null;
        this.executeNext();
    }
}

module.exports = JobQueue