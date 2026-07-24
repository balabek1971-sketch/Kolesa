import { useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Camera,
  Film,
  ImagePlus,
  Trash2,
  Upload,
} from "lucide-react";

const PHOTO_LIMIT = 20;
const PHOTO_SIZE_LIMIT = 15 * 1024 * 1024;
const VIDEO_SIZE_LIMIT = 200 * 1024 * 1024;
const PHOTO_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/avif"]);
const VIDEO_TYPES = new Set(["video/mp4", "video/webm", "video/quicktime"]);

function fileId(file) {
  return `${file.name}-${file.size}-${file.lastModified}-${crypto.randomUUID()}`;
}

function createPhoto(file) {
  return { id: fileId(file), file, previewUrl: URL.createObjectURL(file) };
}

function revokePreview(item) {
  if (item?.previewUrl) URL.revokeObjectURL(item.previewUrl);
}

export function SellMediaStep({ photos, onPhotosChange, video, onVideoChange }) {
  const galleryInputRef = useRef(null);
  const cameraInputRef = useRef(null);
  const videoInputRef = useRef(null);
  const [message, setMessage] = useState("");

  function addPhotos(fileList) {
    const incoming = [...fileList];
    const invalid = incoming.find((file) => !PHOTO_TYPES.has(file.type) || file.size > PHOTO_SIZE_LIMIT);
    if (invalid) {
      setMessage("Фото должны быть JPG, PNG, WebP или AVIF размером до 15 МБ.");
      return;
    }

    const availableSlots = PHOTO_LIMIT - photos.length;
    if (availableSlots <= 0) {
      setMessage("Можно добавить не более 20 фотографий.");
      return;
    }

    const accepted = incoming.slice(0, availableSlots).map(createPhoto);
    onPhotosChange([...photos, ...accepted]);
    setMessage(incoming.length > availableSlots ? "Добавлены первые 20 фотографий." : "");
  }

  function removePhoto(index) {
    revokePreview(photos[index]);
    onPhotosChange(photos.filter((_, itemIndex) => itemIndex !== index));
  }

  function movePhoto(index, direction) {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= photos.length) return;
    const next = [...photos];
    [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
    onPhotosChange(next);
  }

  function chooseVideo(file) {
    if (!file) return;
    if (!VIDEO_TYPES.has(file.type) || file.size > VIDEO_SIZE_LIMIT) {
      setMessage("Видео должно быть MP4, WebM или MOV размером до 200 МБ.");
      return;
    }

    const previewUrl = URL.createObjectURL(file);
    const probe = document.createElement("video");
    probe.preload = "metadata";
    probe.src = previewUrl;
    probe.onloadedmetadata = () => {
      if (probe.duration > 60.5) {
        URL.revokeObjectURL(previewUrl);
        setMessage("Продолжительность видео не должна превышать 60 секунд.");
        return;
      }

      revokePreview(video);
      onVideoChange({
        id: fileId(file),
        file,
        previewUrl,
        duration: Math.ceil(probe.duration),
      });
      setMessage("");
    };
    probe.onerror = () => {
      URL.revokeObjectURL(previewUrl);
      setMessage("Не удалось прочитать видео. Выберите другой файл.");
    };
  }

  function removeVideo() {
    revokePreview(video);
    onVideoChange(null);
  }

  return (
    <div className="sell-media-step">
      <div className="sell-stage-heading">
        <p className="eyebrow">Покажите автомобиль</p>
        <h2>Фото и видео</h2>
        <p>Первое фото станет обложкой. Рекомендуем 5-10 фотографий при дневном свете.</p>
      </div>

      <section className="media-section" aria-labelledby="photos-title">
        <div className="media-section-heading">
          <div>
            <h3 id="photos-title">Фотографии</h3>
            <p>Минимум одна, максимум 20. Номер автомобиля лучше скрыть.</p>
          </div>
          <strong>{photos.length} / {PHOTO_LIMIT}</strong>
        </div>

        <div className="media-actions">
          <button type="button" onClick={() => galleryInputRef.current?.click()}>
            <ImagePlus aria-hidden="true" size={19} />
            Из галереи
          </button>
          <button type="button" onClick={() => cameraInputRef.current?.click()}>
            <Camera aria-hidden="true" size={19} />
            Снять фото
          </button>
        </div>

        <input
          ref={galleryInputRef}
          className="visually-hidden"
          type="file"
          accept="image/jpeg,image/png,image/webp,image/avif"
          multiple
          onChange={(event) => {
            addPhotos(event.target.files);
            event.target.value = "";
          }}
        />
        <input
          ref={cameraInputRef}
          className="visually-hidden"
          type="file"
          accept="image/*"
          capture="environment"
          onChange={(event) => {
            addPhotos(event.target.files);
            event.target.value = "";
          }}
        />

        {photos.length ? (
          <div className="photo-preview-grid">
            {photos.map((photo, index) => (
              <article className="photo-preview" key={photo.id}>
                <img src={photo.previewUrl} alt={`Фото автомобиля ${index + 1}`} />
                {index === 0 && <span className="cover-label">Обложка</span>}
                <div className="photo-tools">
                  <button
                    type="button"
                    aria-label="Переместить фото влево"
                    disabled={index === 0}
                    onClick={() => movePhoto(index, -1)}
                  >
                    <ArrowLeft aria-hidden="true" size={17} />
                  </button>
                  <button
                    type="button"
                    aria-label="Переместить фото вправо"
                    disabled={index === photos.length - 1}
                    onClick={() => movePhoto(index, 1)}
                  >
                    <ArrowRight aria-hidden="true" size={17} />
                  </button>
                  <button type="button" aria-label="Удалить фото" onClick={() => removePhoto(index)}>
                    <Trash2 aria-hidden="true" size={17} />
                  </button>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <button className="media-dropzone" type="button" onClick={() => galleryInputRef.current?.click()}>
            <Upload aria-hidden="true" size={26} />
            <strong>Добавьте фотографии автомобиля</strong>
            <span>JPG, PNG, WebP или AVIF до 15 МБ</span>
          </button>
        )}
      </section>

      <section className="media-section" aria-labelledby="video-title">
        <div className="media-section-heading">
          <div>
            <h3 id="video-title">Видео</h3>
            <p>Одно вертикальное или горизонтальное видео до 60 секунд.</p>
          </div>
          <span className="optional-label">Необязательно</span>
        </div>

        <input
          ref={videoInputRef}
          className="visually-hidden"
          type="file"
          accept="video/mp4,video/webm,video/quicktime"
          onChange={(event) => {
            chooseVideo(event.target.files[0]);
            event.target.value = "";
          }}
        />

        {video ? (
          <div className="video-preview">
            <video src={video.previewUrl} controls preload="metadata" />
            <div>
              <strong>{video.file.name}</strong>
              <span>{video.duration} сек.</span>
              <button type="button" onClick={removeVideo}>
                <Trash2 aria-hidden="true" size={17} />
                Удалить видео
              </button>
            </div>
          </div>
        ) : (
          <button className="video-upload-button" type="button" onClick={() => videoInputRef.current?.click()}>
            <Film aria-hidden="true" size={21} />
            Добавить видео
          </button>
        )}
      </section>

      {message && <p className="media-message" role="alert">{message}</p>}
    </div>
  );
}
