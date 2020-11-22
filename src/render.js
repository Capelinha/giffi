const { desktopCapturer, remote } = require('electron');
const { writeFileSync, copyFileSync, unlinkSync } = require('fs');
const _ = require('lodash');
const FfmpegCommand = require('fluent-ffmpeg');
const moment = require('moment');
const { Menu, dialog } = remote;

document.addEventListener("keydown", function (e) {
  if (e.key === 'F12') {
    remote.getCurrentWindow().toggleDevTools();
  }
});

let mediaRecorder;
let recording = false;
let format = 'mp4';
let recordedChunks = [];

async function getSources() {
  return await desktopCapturer.getSources({
    types: ['screen']
  });
}

document.getElementById('minimize').onclick = (e) => {
  remote.BrowserWindow.getFocusedWindow().minimize();
}

document.getElementById('close').onclick = (e) => {
  remote.BrowserWindow.getFocusedWindow().close();
}

document.getElementById('select').onclick = async () => {
  const inputSources = await getSources();

  const videoOptionsMenu = Menu.buildFromTemplate(
    inputSources.map(source => {
      return {
        label: source.name,
        click: () => selectSource(source)
      };
    })
  );

  videoOptionsMenu.popup();
}

async function selectSource(source) {
  const constraints = {
    audio: false,
    video: {
      mandatory: {
        chromeMediaSource: 'desktop',
        chromeMediaSourceId: source.id
      }
    }
  };

  const stream = await navigator.mediaDevices.getUserMedia(constraints);

  const options = { mimeType: 'video/webm; codecs=vp9' };
  mediaRecorder = new MediaRecorder(stream, options);

  mediaRecorder.ondataavailable = (e) => recordedChunks.push(e.data);
  mediaRecorder.onstop = handleStop;
}

const startVideo = document.getElementById('start-video');
const startGif = document.getElementById('start-gif');

startVideo.onclick = () => {
  format = 'mp4';
  handleStart();
}

startGif.onclick = () => {
  format = 'gif';
  handleStart();
}

function handleStart() {
  startVideo.classList.add('is-warning');
  startGif.classList.add('is-warning');
  remote.BrowserWindow.getFocusedWindow().minimize();

  recordedChunks = [];

  mediaRecorder.start();
  recording = true;
};

remote.BrowserWindow.getFocusedWindow().on('focus', (e) =>{
  if (recording) {
    mediaRecorder.stop();
    startVideo.classList.remove('is-warning');
    startGif.classList.remove('is-warning');
  }
});

async function handleStop() {
  recording = false;

  const blob = new Blob(recordedChunks, {
    type: 'video/mp4; codecs=vp9'
  });

  const buffer = Buffer.from(await blob.arrayBuffer());
  writeFileSync('temp.mp4', buffer);

  const bounds = remote.getCurrentWindow().webContents.getOwnerBrowserWindow().getBounds();

  FfmpegCommand('temp.mp4').videoFilters([
    {
      filter: "crop",
      options: {
        x: bounds.x,
        y: bounds.y + 65,
        w: bounds.width,
        h: bounds.height -65,
      },
    },
  ]).seek(1).output('out.' + format).outputFormat(format).run();

  const { filePath } = await dialog.showSaveDialog({
    buttonLabel: 'Salvar',
    defaultPath: `${moment().format('YYYY-MM-DD-HH-mm-ss')}.${format}`
  });

  if (filePath) {
    copyFileSync('out.' + format, filePath);
  }

  unlinkSync('out.' + format);
  unlinkSync('temp.mp4');
}

function updateSizeView() {
  const { width, height } = remote.getCurrentWindow().webContents.getOwnerBrowserWindow().getBounds();
  document.getElementById('size').innerHTML = `${width}x${height - 65}`;
}

remote.BrowserWindow.getFocusedWindow().on('resize', _.throttle(() =>{
  updateSizeView();
}, 100));

(async () => {
  const sources = await getSources();
  await selectSource(sources[0]);

  updateSizeView();
})();