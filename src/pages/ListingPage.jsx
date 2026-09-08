import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  CalendarDays,
  Camera,
  CarFront,
  Check,
  ChevronLeft,
  ChevronRight,
  Gauge,
	Flag,
  Heart,
  MapPin,
  Maximize2,
	MessageCircle,
  Pause,
  Phone,
  Play,
  ShieldCheck,
  Video,
  Volume2,
	VolumeX,
} from "lucide-react";
import { ListingReportDialog } from "../components/ListingReportDialog.jsx";
import { formatMileage, formatPrice } from "../lib/format.js";
import { fetchListingById, startListingConversation } from "../lib/supabase.js";

function readablePhone(phone) {
  if (!phone) return "";
  const digits = phone.replace(/\D/g, "");
  if (digits.length !== 11) return phone;
  return `+${digits[0]} ${digits.slice(1, 4)} ${digits.slice(4, 7)} ${digits.slice(7, 9)} ${digits.slice(9)}`;
}

function valueOrDash(value) {
  return value || "Не указано";
}

function VideoSlide({ active, item, title }) {
  const videoRef = useRef(null);
  const [opened, setOpened] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);

  useEffect(() => {
    if (active) return;
    videoRef.current?.pause();
    setPlaying(false);
  }, [active]);

  useEffect(() => {
    setOpened(false);
    setPlaying(false);
    setMuted(false);
  }, [item.id]);

  async function openVideo() {
    setOpened(true);
    try {
      await videoRef.current?.play();
    } catch {
      // Native controls remain available when autoplay is blocked.
    }
  }

  async function togglePlayback() {
    const video = videoRef.current;
    if (!video) return;
    setOpened(true);
    if (video.paused) {
      try {
        await video.play();
      } catch {
        // The native play button remains available as a fallback.
      }
    } else {
      video.pause();
    }
  }

  function toggleSound() {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !video.muted;
    setMuted(video.muted);
  }

  async function openFullscreen() {
    const video = videoRef.current;
    if (!video) return;
    setOpened(true);
    video.controls = true;
    if (typeof video.webkitEnterFullscreen === "function") {
      video.webkitEnterFullscreen();
      return;
    }
    try {
      await video.requestFullscreen?.();
    } catch {
      // Some browsers only expose fullscreen through their native controls.
    }
  }

  return (
    <div className={opened ? "listing-video-frame opened" : "listing-video-frame"}>
      <video
        ref={videoRef}
        controls={opened && active}
        muted={muted}
        playsInline
        preload={active ? "metadata" : "none"}
        poster={item.posterUrl || undefined}
        onEnded={() => setPlaying(false)}
        onPause={() => setPlaying(false)}
        onPlay={() => setPlaying(true)}
        onVolumeChange={(event) => setMuted(event.currentTarget.muted)}
      >
        <source src={item.url} type={item.mimeType || "video/mp4"} />
      </video>

      {!opened && (
        <button
          className="listing-video-open"
          type="button"
          tabIndex={active ? 0 : -1}
          onClick={openVideo}
        >
          <Play aria-hidden="true" size={21} fill="currentColor" />
          Открыть видео
        </button>
      )}

      <div className="listing-video-tools">
        {opened && (
          <button
            type="button"
            tabIndex={active ? 0 : -1}
            title={playing ? "Пауза" : "Воспроизвести"}
            aria-label={playing ? "Поставить видео на паузу" : "Воспроизвести видео"}
            onClick={togglePlayback}
          >
            {playing ? <Pause aria-hidden="true" size={19} fill="currentColor" /> : <Play aria-hidden="true" size={19} fill="currentColor" />}
          </button>
        )}
        <button
          type="button"
          tabIndex={active ? 0 : -1}
          title={muted ? "Включить звук" : "Выключить звук"}
          aria-label={muted ? "Включить звук видео" : "Выключить звук видео"}
          onClick={toggleSound}
        >
          {muted ? <VolumeX aria-hidden="true" size={20} /> : <Volume2 aria-hidden="true" size={20} />}
        </button>
        <button
          type="button"
          tabIndex={active ? 0 : -1}
          title="Открыть на весь экран"
          aria-label={`Открыть видео ${title} на весь экран`}
          onClick={openFullscreen}
        >
          <Maximize2 aria-hidden="true" size={19} />
        </button>
      </div>
    </div>
  );
}

export function ListingPage({ auth, fallbackListing, favorite, listingId, onFavoriteToggle }) {
  const [listing, setListing] = useState(fallbackListing || null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
	const [contactError, setContactError] = useState("");
	const [openingChat, setOpeningChat] = useState(false);
	const [reportOpen, setReportOpen] = useState(false);
	const [reportFeedback, setReportFeedback] = useState("");
  const [currentMediaIndex, setCurrentMediaIndex] = useState(0);
  const mediaTrackRef = useRef(null);
  const scrollFrameRef = useRef(0);
  const pointerDragRef = useRef(null);

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [listingId]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");

    fetchListingById(listingId)
      .then((result) => {
        if (!active) return;
        if (!result) {
          if (!fallbackListing) setError("Объявление не найдено или уже снято с публикации.");
          return;
        }
        setListing(result);
      })
      .catch((loadError) => {
        if (active && !fallbackListing) {
          setError(loadError.message || "Не удалось загрузить объявление.");
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [fallbackListing, listingId]);

  const media = useMemo(() => {
    const listingMedia = listing?.media?.length
      ? listing.media
      : listing?.imageUrl
        ? [{ id: `${listing.id}-cover`, kind: "photo", url: listing.imageUrl }]
        : [];

    return [
      ...listingMedia.filter((item) => item.kind === "photo"),
      ...listingMedia.filter((item) => item.kind === "video"),
      ...listingMedia.filter((item) => item.kind !== "photo" && item.kind !== "video"),
    ];
  }, [listing]);

  const photoCount = useMemo(() => media.filter((item) => item.kind === "photo").length, [media]);
  const videoCount = useMemo(() => media.filter((item) => item.kind === "video").length, [media]);
  const currentMedia = media[currentMediaIndex] || media[0];
  const currentPhotoNumber = currentMedia?.kind === "photo"
    ? media.slice(0, currentMediaIndex + 1).filter((item) => item.kind === "photo").length
    : 0;
  const currentVideoNumber = currentMedia?.kind === "video"
    ? media.slice(0, currentMediaIndex + 1).filter((item) => item.kind === "video").length
    : 0;
  const currentMediaLabel = currentMedia?.kind === "video"
    ? `Видео ${currentVideoNumber} из ${videoCount}`
    : `Фото ${currentPhotoNumber || 1} из ${photoCount || 1}`;

  useEffect(() => {
    setCurrentMediaIndex(0);
    const frame = window.requestAnimationFrame(() => {
      mediaTrackRef.current?.scrollTo({ left: 0, behavior: "auto" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [listingId, media.length]);

  useEffect(() => () => window.cancelAnimationFrame(scrollFrameRef.current), []);

  function goToMedia(index, behavior = "smooth") {
    if (!media.length) return;
    const nextIndex = Math.max(0, Math.min(index, media.length - 1));
    const track = mediaTrackRef.current;
    if (track) {
      track.scrollTo({ left: track.clientWidth * nextIndex, behavior });
    }
    setCurrentMediaIndex(nextIndex);
  }

  function finishPointerDragById(pointerId) {
    const drag = pointerDragRef.current;
    const track = mediaTrackRef.current;
    if (!drag || drag.id !== pointerId || !track) return;
    pointerDragRef.current = null;
    track.classList.remove("dragging");
    if (track.hasPointerCapture(pointerId)) {
      track.releasePointerCapture(pointerId);
    }
    const nextIndex = Math.round(track.scrollLeft / Math.max(track.clientWidth, 1));
    goToMedia(nextIndex);
  }

  useEffect(() => {
    const finishWindowDrag = (event) => finishPointerDragById(event.pointerId);
    window.addEventListener("pointerup", finishWindowDrag, true);
    window.addEventListener("pointercancel", finishWindowDrag, true);
    return () => {
      window.removeEventListener("pointerup", finishWindowDrag, true);
      window.removeEventListener("pointercancel", finishWindowDrag, true);
    };
  }, [media.length]);

  function handleMediaScroll(event) {
    const track = event.currentTarget;
    window.cancelAnimationFrame(scrollFrameRef.current);
    scrollFrameRef.current = window.requestAnimationFrame(() => {
      const nextIndex = Math.round(track.scrollLeft / Math.max(track.clientWidth, 1));
      setCurrentMediaIndex(Math.max(0, Math.min(nextIndex, media.length - 1)));
    });
  }

  function handleMediaKeyDown(event) {
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      goToMedia(currentMediaIndex - 1);
    }
    if (event.key === "ArrowRight") {
      event.preventDefault();
      goToMedia(currentMediaIndex + 1);
    }
  }

  function handlePointerDown(event) {
    if (event.pointerType !== "mouse" || event.button !== 0 || event.target.closest("button, video")) return;
    pointerDragRef.current = {
      id: event.pointerId,
      startX: event.clientX,
      startScrollLeft: event.currentTarget.scrollLeft,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    event.currentTarget.classList.add("dragging");
  }

  function handlePointerMove(event) {
    const drag = pointerDragRef.current;
    if (!drag || drag.id !== event.pointerId) return;
    event.currentTarget.scrollLeft = drag.startScrollLeft - (event.clientX - drag.startX);
  }

  function finishPointerDrag(event) {
    finishPointerDragById(event.pointerId);
  }

  if (loading && !listing) {
    return <main className="listing-detail-page"><p className="page-status">Загружаем объявление...</p></main>;
  }

  if (error || !listing) {
    return (
      <main className="listing-detail-page">
        <section className="listing-not-found">
          <CarFront aria-hidden="true" size={42} strokeWidth={1.4} />
          <h1>Объявление недоступно</h1>
          <p>{error || "Возможно, автомобиль уже продан или объявление удалено."}</p>
          <a href="#catalog"><ArrowLeft aria-hidden="true" size={17} />Вернуться в каталог</a>
        </section>
      </main>
    );
  }

  const phone = readablePhone(listing.phone);
  const phoneHref = listing.phone ? `tel:${listing.phone.replace(/[^\d+]/g, "")}` : "";

	async function handleMessageSeller() {
		if (!auth?.session) {
			window.location.hash = "/account";
			return;
		}
		setOpeningChat(true);
		setContactError("");
		try {
			const conversationId = await startListingConversation(listingId);
			window.location.hash = `/messages/${conversationId}`;
		} catch (chatError) {
			setContactError(chatError.message || "Не удалось открыть диалог.");
		} finally {
			setOpeningChat(false);
		}
	}

	function openReport() {
		if (!auth?.session) {
			window.location.hash = "/account";
			return;
		}
		setReportOpen(true);
	}
  const facts = [
    ["Год выпуска", listing.year],
    ["Пробег", formatMileage(listing.mileage)],
    ["Кузов", valueOrDash(listing.body)],
    ["Коробка", valueOrDash(listing.gearbox)],
    ["Двигатель", [listing.engineType, listing.engineVolume && `${listing.engineVolume} л`].filter(Boolean).join(", ") || "Не указано"],
    ["Привод", valueOrDash(listing.drivetrain)],
    ["Руль", valueOrDash(listing.steering)],
    ["Цвет", [listing.colorName, listing.metallic && "металлик"].filter(Boolean).join(", ") || "Не указано"],
    ["Страна происхождения", valueOrDash(listing.originCountry)],
    ["Растаможен", listing.cleared ? "Да" : "Нет"],
  ];

  return (
    <main className="listing-detail-page">
      <div className="listing-detail-shell">
        <a className="listing-back" href="#catalog">
          <ArrowLeft aria-hidden="true" size={17} />
          Назад к объявлениям
        </a>

        <div className="listing-detail-grid">
          <section className="listing-gallery" aria-label="Фотографии и видео автомобиля">
            <div className="listing-main-media">
              {media.length ? (
                <div
                  ref={mediaTrackRef}
                  className="listing-media-track"
                  role="group"
                  aria-label="Галерея автомобиля"
                  aria-roledescription="карусель"
                  tabIndex={media.length > 1 ? 0 : -1}
                  onKeyDown={handleMediaKeyDown}
                  onPointerCancel={finishPointerDrag}
                  onPointerDown={handlePointerDown}
                  onPointerMove={handlePointerMove}
                  onPointerUp={finishPointerDrag}
                  onScroll={handleMediaScroll}
                >
                  {media.map((item, index) => (
                    <div
                      className={item.kind === "video" ? "listing-media-slide video" : "listing-media-slide photo"}
                      key={item.id}
                      role="group"
                      aria-label={item.kind === "video" ? `Видео ${index - photoCount + 1}` : `Фото ${index + 1}`}
                      aria-roledescription="слайд"
                    >
                      {item.kind === "video" ? (
                        <VideoSlide active={index === currentMediaIndex} item={item} title={listing.title} />
                      ) : (
                        <img
                          src={item.url}
                          alt={`${listing.title}, фото ${index + 1}`}
                          draggable="false"
                          fetchpriority={index === 0 ? "high" : "auto"}
                          loading={index === 0 ? "eager" : "lazy"}
                        />
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <span className="listing-media-empty"><CarFront aria-hidden="true" size={64} strokeWidth={1.2} /></span>
              )}

              {media.length > 0 && (
                <>
                  <span className="listing-media-total">
                    <Camera aria-hidden="true" size={15} />
                    {photoCount} фото
                    {videoCount > 0 && <><i aria-hidden="true" /> <Video aria-hidden="true" size={15} />{videoCount} видео</>}
                  </span>
                  <span className="listing-media-counter" aria-live="polite">{currentMediaLabel}</span>
                </>
              )}

              {media.length > 1 && (
                <>
                  <button
                    className="listing-gallery-arrow previous"
                    type="button"
                    disabled={currentMediaIndex === 0}
                    title="Предыдущее фото"
                    aria-label="Показать предыдущее медиа"
                    onClick={() => goToMedia(currentMediaIndex - 1)}
                  >
                    <ChevronLeft aria-hidden="true" size={24} />
                  </button>
                  <button
                    className="listing-gallery-arrow next"
                    type="button"
                    disabled={currentMediaIndex === media.length - 1}
                    title="Следующее фото или видео"
                    aria-label="Показать следующее медиа"
                    onClick={() => goToMedia(currentMediaIndex + 1)}
                  >
                    <ChevronRight aria-hidden="true" size={24} />
                  </button>
                </>
              )}
            </div>

            {media.length > 1 && (
              <div className="listing-thumbnails" aria-label="Миниатюры галереи">
                {media.map((item, index) => (
                  <button
                    className={index === currentMediaIndex ? "active" : ""}
                    key={item.id}
                    type="button"
                    aria-current={index === currentMediaIndex ? "true" : undefined}
                    aria-label={item.kind === "video" ? `Показать видео ${index - photoCount + 1}` : `Показать фото ${index + 1}`}
                    onClick={() => goToMedia(index)}
                  >
                    {item.kind === "video" ? (
                      <video muted playsInline preload="metadata" poster={item.posterUrl || undefined} src={item.url} />
                    ) : (
                      <img src={item.url} alt="" loading="lazy" />
                    )}
                    {item.kind === "video" && <span><Video aria-hidden="true" size={12} />Видео</span>}
                  </button>
                ))}
              </div>
            )}
          </section>

          <aside className="listing-summary">
            <div className="listing-summary-head">
              <div>
                <p className="eyebrow">Автомобиль в продаже</p>
                <h1>{listing.title}</h1>
              </div>
              <button
                className={favorite ? "detail-favorite active" : "detail-favorite"}
                type="button"
                aria-label={favorite ? "Убрать из избранного" : "Добавить в избранное"}
                onClick={() => onFavoriteToggle(listing.id)}
              >
                <Heart aria-hidden="true" size={22} fill={favorite ? "currentColor" : "none"} />
              </button>
            </div>

            <strong className="listing-price">{formatPrice(listing.price)}</strong>
            <div className="listing-quick-facts">
              <span><CalendarDays aria-hidden="true" size={17} />{listing.year}</span>
              <span><Gauge aria-hidden="true" size={17} />{formatMileage(listing.mileage)}</span>
              <span><MapPin aria-hidden="true" size={17} />{listing.city}</span>
            </div>

            <div className="listing-seller">
              <span>Продавец</span>
              <strong>{listing.seller}</strong>
              {phoneHref ? (
                <a href={phoneHref}><Phone aria-hidden="true" size={18} />{phone}</a>
              ) : (
                <p>Телефон не указан</p>
              )}
			  <button className="listing-message-seller" type="button" disabled={openingChat} onClick={handleMessageSeller}>
				<MessageCircle aria-hidden="true" size={18} />
				{openingChat ? "Открываем диалог..." : "Написать продавцу"}
			  </button>
			  {contactError && <p className="listing-contact-error" role="alert">{contactError}</p>}
            </div>

            <p className="listing-safety">
              <ShieldCheck aria-hidden="true" size={19} />
              Не переводите предоплату до осмотра автомобиля и документов.
            </p>
			<button className="listing-report-button" type="button" onClick={openReport}>
				<Flag aria-hidden="true" size={16} />
				Пожаловаться на объявление
			</button>
			{reportFeedback && <p className="listing-report-feedback" role="status">{reportFeedback}</p>}
          </aside>
        </div>

        <section className="listing-specifications">
          <h2>Характеристики</h2>
          <dl>
            {facts.map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
          <div className="listing-flags">
            {listing.hasVehicleHistory && <span><Check aria-hidden="true" size={15} />Есть история автомобиля</span>}
            {listing.damaged && <span className="danger">Аварийный / не на ходу</span>}
          </div>
        </section>

        <section className="listing-description">
          <h2>Описание продавца</h2>
          <p>{listing.description || "Продавец не добавил описание."}</p>
        </section>
      </div>

      <ListingReportDialog
        listingId={listingId}
        listingTitle={listing.title}
        open={reportOpen}
        onClose={() => setReportOpen(false)}
        onSubmitted={() => setReportFeedback("Жалоба отправлена администратору.")}
      />
    </main>
  );
}
