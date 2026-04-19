(function () {
  'use strict';

  // ---------------------------------------------------------------------------
  // Shared helpers and third-party URL builders
  // ---------------------------------------------------------------------------

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function getYouTubeEmbedUrl(videoId, autoplay, startAtSeconds) {
    var start = Math.max(0, Math.floor(startAtSeconds || 0));
    return 'https://www.youtube.com/embed/' + videoId + '?autoplay=' + (autoplay ? '1' : '0') + '&mute=0&controls=0&rel=0&modestbranding=1&playsinline=1&enablejsapi=1&start=' + start;
  }

  function getVimeoEmbedUrl(videoId, autoplay) {
    return 'https://player.vimeo.com/video/' + videoId + '?autoplay=' + (autoplay ? '1' : '0') + '&muted=0&title=0&byline=0&portrait=0&dnt=1';
  }

  // Loads the YouTube Iframe API once, then replays queued callbacks.
  var youTubeApi = (function () {
    var callbacks = [];
    var loading = false;

    function ensureReady(callback) {
      if (window.YT && window.YT.Player) {
        callback();
        return;
      }

      callbacks.push(callback);

      if (loading) return;
      loading = true;

      var previousReadyHandler = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = function () {
        if (typeof previousReadyHandler === 'function') {
          previousReadyHandler();
        }

        var queued = callbacks.slice();
        callbacks = [];
        queued.forEach(function (queuedCallback) {
          queuedCallback();
        });
      };

      var scriptTag = document.createElement('script');
      scriptTag.src = 'https://www.youtube.com/iframe_api';
      document.head.appendChild(scriptTag);
    }

    return {
      ensureReady: ensureReady
    };
  })();

  function requestBalancedVolume(player) {
    if (!player || typeof player.setVolume !== 'function') return;
    if (typeof player.unMute === 'function') {
      player.unMute();
    }
    player.setVolume(10);
  }

  // ---------------------------------------------------------------------------
  // Image lightbox module
  // ---------------------------------------------------------------------------
  function createImageLightbox(imageSelector) {
    var lightbox = document.getElementById('imageLightbox');
    var lightboxImage = document.getElementById('lightboxImage');
    var closeButton = document.getElementById('lightboxClose');

    if (!lightbox || !lightboxImage || !closeButton) {
      return null;
    }

    var galleryImages = document.querySelectorAll(imageSelector);
    if (!galleryImages.length) {
      return null;
    }

    var zoomLevel = 1;
    var minZoom = 1;
    var maxZoom = 4;
    var panX = 0;
    var panY = 0;
    var isDragging = false;
    var dragStartX = 0;
    var dragStartY = 0;
    var dragStartPanX = 0;
    var dragStartPanY = 0;

    lightboxImage.draggable = false;

    // Compute pan limits so users can drag only within visible image bounds.
    function getPanBounds() {
      var imgWidth = lightboxImage.clientWidth;
      var imgHeight = lightboxImage.clientHeight;
      var maxPanX = ((imgWidth * zoomLevel) - imgWidth) / 2;
      var maxPanY = ((imgHeight * zoomLevel) - imgHeight) / 2;

      return {
        minX: -Math.max(0, maxPanX),
        maxX: Math.max(0, maxPanX),
        minY: -Math.max(0, maxPanY),
        maxY: Math.max(0, maxPanY)
      };
    }

    function clampPan() {
      var bounds = getPanBounds();
      panX = clamp(panX, bounds.minX, bounds.maxX);
      panY = clamp(panY, bounds.minY, bounds.maxY);
    }

    function applyZoom() {
      if (zoomLevel <= 1) {
        panX = 0;
        panY = 0;
      }

      clampPan();
      lightboxImage.style.transform = 'translate(' + panX + 'px, ' + panY + 'px) scale(' + zoomLevel + ')';
      lightboxImage.style.cursor = zoomLevel > 1 ? 'grab' : 'zoom-in';
    }

    function openLightbox(src, altText) {
      lightboxImage.src = src;
      lightboxImage.alt = altText || 'Expanded preview';
      zoomLevel = 1;
      panX = 0;
      panY = 0;
      applyZoom();
      lightbox.classList.add('open');
      lightbox.setAttribute('aria-hidden', 'false');
      document.body.classList.add('lightbox-open');
    }

    function closeLightbox() {
      lightbox.classList.remove('open');
      lightbox.setAttribute('aria-hidden', 'true');
      document.body.classList.remove('lightbox-open');
      lightboxImage.src = '';
      zoomLevel = 1;
      panX = 0;
      panY = 0;
      isDragging = false;
      lightboxImage.classList.remove('dragging');
      applyZoom();
    }

    galleryImages.forEach(function (image) {
      image.addEventListener('click', function () {
        openLightbox(image.src, image.alt);
      });
    });

    // Allows deep-linking from other pages, e.g. graphic-design.html?image=<url>
    (function openImageFromUrl() {
      if (!window.location.search) return;

      var params = new URLSearchParams(window.location.search);
      var requestedImage = params.get('image');
      if (!requestedImage) return;

      var matchingImage = null;
      galleryImages.forEach(function (image) {
        if (!matchingImage && image.src === requestedImage) {
          matchingImage = image;
        }
      });

      if (matchingImage) {
        openLightbox(matchingImage.src, matchingImage.alt);
      }
    })();

    closeButton.addEventListener('click', closeLightbox);

    lightbox.addEventListener('click', function (event) {
      if (event.target === lightbox) {
        closeLightbox();
      }
    });

    lightbox.addEventListener('wheel', function (event) {
      if (!lightbox.classList.contains('open')) return;

      // Scroll up to zoom in, scroll down to zoom out.
      event.preventDefault();
      var delta = event.deltaY < 0 ? 0.2 : -0.2;
      zoomLevel = clamp(zoomLevel + delta, minZoom, maxZoom);
      applyZoom();
    }, { passive: false });

    lightboxImage.addEventListener('pointerdown', function (event) {
      if (!lightbox.classList.contains('open') || zoomLevel <= 1) return;

      event.preventDefault();
      isDragging = true;
      dragStartX = event.clientX;
      dragStartY = event.clientY;
      dragStartPanX = panX;
      dragStartPanY = panY;
      lightboxImage.classList.add('dragging');
      lightboxImage.setPointerCapture(event.pointerId);
    });

    lightboxImage.addEventListener('pointermove', function (event) {
      if (!isDragging) return;

      var deltaX = event.clientX - dragStartX;
      var deltaY = event.clientY - dragStartY;
      panX = dragStartPanX + deltaX;
      panY = dragStartPanY + deltaY;
      applyZoom();
    });

    // Shared cleanup for all pointer-end events.
    function stopDragging() {
      if (!isDragging) return;
      isDragging = false;
      lightboxImage.classList.remove('dragging');
    }

    lightboxImage.addEventListener('pointerup', stopDragging);
    lightboxImage.addEventListener('pointercancel', stopDragging);
    lightboxImage.addEventListener('pointerleave', stopDragging);

    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && lightbox.classList.contains('open')) {
        closeLightbox();
      }
    });

    return {
      isOpen: function () {
        return lightbox.classList.contains('open');
      },
      close: closeLightbox
    };
  }

  // ---------------------------------------------------------------------------
  // Generic video modal module
  // ---------------------------------------------------------------------------
  function createVideoModal() {
    var videoLightbox = document.getElementById('videoLightbox');
    var videoLightboxStage = document.getElementById('videoLightboxStage');
    var videoLightboxClose = document.getElementById('videoLightboxClose');

    if (!videoLightbox || !videoLightboxStage || !videoLightboxClose) {
      return null;
    }

    var videoLightboxPlayer = null;

    function close() {
      if (videoLightboxPlayer && typeof videoLightboxPlayer.destroy === 'function') {
        videoLightboxPlayer.destroy();
      }
      videoLightboxPlayer = null;
      videoLightbox.classList.remove('open');
      videoLightbox.setAttribute('aria-hidden', 'true');
      videoLightboxStage.innerHTML = '';
      videoLightboxStage.classList.remove('vertical');
      videoLightboxStage.classList.remove('scan-stage');
      document.body.classList.remove('lightbox-open');
    }

    function open(options) {
      // options: { src, title, vertical, stageClass, youtube }
      var src = options.src;
      var title = options.title || 'Video preview';
      var vertical = !!options.vertical;
      var stageClass = options.stageClass || '';
      var youtube = !!options.youtube;

      videoLightboxStage.innerHTML = '';
      videoLightboxStage.classList.toggle('vertical', vertical);
      videoLightboxStage.classList.toggle('scan-stage', stageClass === 'scan-stage');

      var iframe = document.createElement('iframe');
      iframe.src = src;
      iframe.title = title;
      iframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';
      iframe.allowFullscreen = true;
      videoLightboxStage.appendChild(iframe);

      videoLightbox.classList.add('open');
      videoLightbox.setAttribute('aria-hidden', 'false');
      document.body.classList.add('lightbox-open');

      // Only initialize a YT player when provider is YouTube.
      if (!youtube) return;

      youTubeApi.ensureReady(function () {
        if (!videoLightboxStage.contains(iframe)) return;

        videoLightboxPlayer = new window.YT.Player(iframe, {
          events: {
            onReady: function (event) {
              requestBalancedVolume(event.target);
            },
            onStateChange: function (event) {
              if (event.data === window.YT.PlayerState.PLAYING) {
                requestBalancedVolume(event.target);
              }
            }
          }
        });
      });
    }

    videoLightboxClose.addEventListener('click', close);

    videoLightbox.addEventListener('click', function (event) {
      if (event.target === videoLightbox) {
        close();
      }
    });

    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && videoLightbox.classList.contains('open')) {
        close();
      }
    });

    return {
      open: open,
      close: close,
      isOpen: function () {
        return videoLightbox.classList.contains('open');
      }
    };
  }

  // Determines provider metadata from data-* attributes on a video tile.
  function getTileVideoData(tile) {
    if (tile.dataset.videoProvider === 'custom' && tile.dataset.videoSrc) {
      return {
        provider: 'custom',
        src: tile.dataset.videoSrc
      };
    }

    if (tile.dataset.youtubeId) {
      return {
        provider: 'youtube',
        id: tile.dataset.youtubeId
      };
    }

    if (tile.dataset.videoProvider && tile.dataset.videoId) {
      return {
        provider: tile.dataset.videoProvider,
        id: tile.dataset.videoId
      };
    }

    return null;
  }

  // Upgrades thumbnails from highest to fallback quality if requests fail.
  function applyBestYouTubeThumbnail(tile) {
    var videoId = tile.dataset.youtubeId;
    var poster = tile.querySelector('.video-poster');
    if (!videoId || !poster) return;

    var thumbnailCandidates = [
      'https://i.ytimg.com/vi/' + videoId + '/maxresdefault.jpg',
      'https://i.ytimg.com/vi/' + videoId + '/sddefault.jpg',
      'https://i.ytimg.com/vi/' + videoId + '/hqdefault.jpg',
      'https://i.ytimg.com/vi/' + videoId + '/mqdefault.jpg',
      'https://i.ytimg.com/vi/' + videoId + '/default.jpg'
    ];

    var candidateIndex = 0;

    function tryNextThumbnail() {
      if (candidateIndex >= thumbnailCandidates.length) return;
      poster.src = thumbnailCandidates[candidateIndex];
      candidateIndex += 1;
    }

    poster.addEventListener('error', tryNextThumbnail);
    tryNextThumbnail();
  }

  // ---------------------------------------------------------------------------
  // Video tile behavior (inline play + modal playback)
  // ---------------------------------------------------------------------------
  function initVideoTiles(videoModalApi) {
    var videoTiles = document.querySelectorAll('.video-tile');
    if (!videoTiles.length || !videoModalApi) {
      return;
    }

    var inlineVideoIframes = new WeakMap();
    var inlineVideoPlayers = new WeakMap();
    var inlineVideoPositions = new WeakMap();

    // Normalizes provider URLs so the rest of the module can stay provider-agnostic.
    function getEmbedSrc(videoData, autoplay, startAtSeconds) {
      if (videoData.provider === 'vimeo') {
        return getVimeoEmbedUrl(videoData.id, autoplay);
      }

      if (videoData.provider === 'custom') {
        return videoData.src || '';
      }

      return getYouTubeEmbedUrl(videoData.id, autoplay, startAtSeconds || 0);
    }

    function resetInlineVideo(tile, saveProgress) {
      var frameContainer = tile.querySelector('.video-frame');
      var poster = tile.querySelector('.video-poster');
      var playBtn = tile.querySelector('.video-play-btn');
      var player = inlineVideoPlayers.get(tile);

      if (!frameContainer) return;

      if (saveProgress && player && typeof player.getCurrentTime === 'function') {
        // Keep position so replay resumes where the user left off.
        var currentTime = player.getCurrentTime();
        inlineVideoPositions.set(tile, Math.max(0, currentTime || 0));
      }

      if (player && typeof player.destroy === 'function') {
        player.destroy();
      }

      inlineVideoPlayers.delete(tile);
      inlineVideoIframes.delete(tile);
      frameContainer.innerHTML = '';
      tile.classList.remove('playing');

      if (poster) poster.style.display = '';
      if (playBtn) playBtn.style.display = '';
    }

    function openVideoLightbox(tile, isVertical) {
      var videoData = getTileVideoData(tile);
      if (!videoData) return;

      videoModalApi.open({
        src: getEmbedSrc(videoData, true, 0),
        title: 'Video preview',
        vertical: isVertical,
        youtube: videoData.provider === 'youtube'
      });
    }

    function playInlineVideo(tile) {
      var videoData = getTileVideoData(tile);
      if (!videoData) return;

      var existingFrame = inlineVideoIframes.get(tile);
      if (existingFrame) return;

      var frameContainer = tile.querySelector('.video-frame');
      var poster = tile.querySelector('.video-poster');
      var playBtn = tile.querySelector('.video-play-btn');
      var resumeAt = inlineVideoPositions.get(tile) || 0;
      var isVertical = tile.classList.contains('vertical-video');

      if (!frameContainer) return;

      var iframe = document.createElement('iframe');
      iframe.src = getEmbedSrc(videoData, true, resumeAt);
      iframe.title = 'Inline video player';
      iframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';
      iframe.allowFullscreen = true;

      frameContainer.appendChild(iframe);
      inlineVideoIframes.set(tile, iframe);
      tile.classList.add('playing');
      tile.classList.toggle('vertical-video-playing', isVertical);

      if (poster) poster.style.display = 'none';
      if (playBtn) playBtn.style.display = 'none';

      if (videoData.provider !== 'youtube') return;

      youTubeApi.ensureReady(function () {
        if (!frameContainer.contains(iframe)) return;

        var player = new window.YT.Player(iframe, {
          events: {
            onReady: function (event) {
              requestBalancedVolume(event.target);
            },
            onStateChange: function (event) {
              if (event.data === window.YT.PlayerState.PLAYING) {
                requestBalancedVolume(event.target);
              }

              // Pause collapses the inline player but stores progress.
              if (event.data === window.YT.PlayerState.PAUSED) {
                resetInlineVideo(tile, true);
              }

              // Ended resets to poster state and forgets progress.
              if (event.data === window.YT.PlayerState.ENDED) {
                inlineVideoPositions.delete(tile);
                resetInlineVideo(tile, false);
              }
            }
          }
        });

        inlineVideoPlayers.set(tile, player);
      });
    }

    videoTiles.forEach(function (tile) {
      var playBtn = tile.querySelector('.video-play-btn');
      var expandBtn = tile.querySelector('.scan-expand-btn');
      var isVertical = tile.classList.contains('vertical-video');

      applyBestYouTubeThumbnail(tile);

      tile.addEventListener('click', function (event) {
        // Ignore clicks meant for play/expand controls.
        if (playBtn && (event.target === playBtn || playBtn.contains(event.target))) return;
        if (expandBtn && (event.target === expandBtn || expandBtn.contains(event.target))) return;

        openVideoLightbox(tile, isVertical);
      });

      if (playBtn) {
        playBtn.addEventListener('click', function (event) {
          event.stopPropagation();
          playInlineVideo(tile);
        });
      }

      if (expandBtn) {
        expandBtn.addEventListener('click', function (event) {
          event.stopPropagation();
          openVideoLightbox(tile, isVertical);
        });
      }
    });

    // Allows deep-linking from other pages, e.g. video-editing.html?video=YKCeKWzE3LI
    (function openVideoFromUrl() {
      if (!window.location.search) return;

      var params = new URLSearchParams(window.location.search);
      var requestedVideo = params.get('video');
      if (!requestedVideo) return;

      var matchingTile = null;
      videoTiles.forEach(function (tile) {
        if (matchingTile) return;

        if (tile.dataset.youtubeId === requestedVideo || tile.dataset.videoId === requestedVideo) {
          matchingTile = tile;
        }
      });

      if (!matchingTile) return;

      matchingTile.scrollIntoView({ behavior: 'smooth', block: 'center' });
      openVideoLightbox(matchingTile, matchingTile.classList.contains('vertical-video'));
    })();
  }

  // ---------------------------------------------------------------------------
  // Campus tour behavior (native fullscreen with modal fallback)
  // ---------------------------------------------------------------------------
  function initCampusTourTiles(videoModalApi) {
    var campusTourTiles = document.querySelectorAll('.campus-tour-tile');
    if (!campusTourTiles.length) return;

    function getFullscreenElement() {
      return document.fullscreenElement || document.webkitFullscreenElement || null;
    }

    function openNativeFullscreen(element) {
      if (!element) return false;

      if (typeof element.requestFullscreen === 'function') {
        element.requestFullscreen();
        return true;
      }

      if (typeof element.webkitRequestFullscreen === 'function') {
        element.webkitRequestFullscreen();
        return true;
      }

      return false;
    }

    function exitNativeFullscreen() {
      if (typeof document.exitFullscreen === 'function') {
        document.exitFullscreen();
        return true;
      }

      if (typeof document.webkitExitFullscreen === 'function') {
        document.webkitExitFullscreen();
        return true;
      }

      return false;
    }

    function syncFullscreenButtons() {
      var fullscreenElement = getFullscreenElement();

      campusTourTiles.forEach(function (tile) {
        var fullscreenBtn = tile.querySelector('.campus-tour-fullscreen-btn');
        if (!fullscreenBtn) return;

        var isTileFullscreen = fullscreenElement === tile;
        fullscreenBtn.textContent = isTileFullscreen ? 'Exit Fullscreen' : 'Fullscreen';
        fullscreenBtn.setAttribute('aria-label', isTileFullscreen ? 'Exit campus tour fullscreen' : 'Open campus tour fullscreen');
      });
    }

    campusTourTiles.forEach(function (tile) {
      var frame = tile.querySelector('iframe');
      var fullscreenBtn = tile.querySelector('.campus-tour-fullscreen-btn');
      var src = frame ? frame.src : '';
      var titleText = frame ? frame.title : 'Campus tour';

      if (!fullscreenBtn) return;

      fullscreenBtn.addEventListener('click', function (event) {
        event.stopPropagation();
        var fullscreenElement = getFullscreenElement();

        if (fullscreenElement === tile) {
          exitNativeFullscreen();
          return;
        }

        if (openNativeFullscreen(tile)) return;

        // Fallback for browsers/environments that block element fullscreen.
        if (videoModalApi) {
          videoModalApi.open({
            src: src,
            title: titleText,
            stageClass: 'scan-stage',
            youtube: false
          });
        }
      });
    });

    document.addEventListener('fullscreenchange', syncFullscreenButtons);
    document.addEventListener('webkitfullscreenchange', syncFullscreenButtons);
    syncFullscreenButtons();
  }

  // ---------------------------------------------------------------------------
  // Website showcase modal (Graphic Design page)
  // ---------------------------------------------------------------------------
  function initWebsiteShowcase() {
    var websiteTriggers = document.querySelectorAll('.website-showcase-trigger');
    var websiteModal = document.getElementById('websiteShowcase');

    if (!websiteTriggers.length || !websiteModal) {
      return;
    }

    var websiteModalImage = document.getElementById('websiteShowcaseImage');
    var websiteModalVideo = document.getElementById('websiteShowcaseVideo');
    var websiteModalClose = document.getElementById('websiteShowcaseClose');
    var websiteModalPrev = document.getElementById('websiteShowcasePrev');
    var websiteModalNext = document.getElementById('websiteShowcaseNext');
    var websiteModalCount = document.getElementById('websiteShowcaseCount');

    if (!websiteModalImage || !websiteModalVideo || !websiteModalClose || !websiteModalPrev || !websiteModalNext || !websiteModalCount) {
      return;
    }

    var websiteTouchStartX = 0;
    var websiteTouchStartY = 0;
    var websiteIndex = 0;
    var activeWebsiteItems = [];

    // Static slideshow data keyed by trigger data-showcase-id.
    var websiteShowcases = {
      'idaho-sky': [
        {
          type: 'image',
          src: 'https://res.cloudinary.com/dewtyrnh4/image/upload/v1776544668/MacbookIdahoMockup_xjih4t.jpg',
          alt: 'Idaho Sky Website Macbook Mockup'
        },
        {
          type: 'image',
          src: 'https://res.cloudinary.com/dewtyrnh4/image/upload/v1776544868/PhoneIdahoSkyMockup_okccgu.jpg',
          alt: 'Idaho Sky Website Phone Mockup'
        },
        {
          type: 'video',
          src: 'https://www.youtube.com/embed/RVOb-K5EsB8?autoplay=1&mute=1&controls=0&rel=0&modestbranding=1&playsinline=1',
          alt: 'Idaho Sky Website Walkthrough Video'
        }
      ],
      grinnell: [
        {
          type: 'image',
          src: 'https://res.cloudinary.com/dewtyrnh4/image/upload/v1776547519/WebsiteMockupScale_moap4k.jpg',
          alt: 'Grinnell Website Mockup'
        },
        {
          type: 'video',
          src: 'https://www.youtube.com/embed/LCBi9vihg40?autoplay=1&mute=1&controls=0&rel=0&modestbranding=1&playsinline=1',
          alt: 'Grinnell Website Home Page'
        }
      ]
    };

    function updateWebsiteModal() {
      if (!activeWebsiteItems.length) return;

      var item = activeWebsiteItems[websiteIndex];
      websiteModalCount.textContent = (websiteIndex + 1) + ' / ' + activeWebsiteItems.length;

      if (item.type === 'image') {
        websiteModalVideo.classList.remove('active');
        websiteModalVideo.src = '';
        websiteModalImage.src = item.src;
        websiteModalImage.alt = item.alt;
        websiteModalImage.classList.add('active');
        return;
      }

      websiteModalImage.classList.remove('active');
      websiteModalImage.src = '';
      websiteModalImage.alt = '';
      websiteModalVideo.src = item.src;
      websiteModalVideo.classList.add('active');
    }

    function openWebsiteModal(showcaseId, startIndex) {
      activeWebsiteItems = websiteShowcases[showcaseId] || [];
      if (!activeWebsiteItems.length) return;

      websiteIndex = startIndex || 0;
      updateWebsiteModal();
      websiteModal.classList.add('open');
      websiteModal.setAttribute('aria-hidden', 'false');
      document.body.classList.add('lightbox-open');
    }

    function closeWebsiteModal() {
      websiteModal.classList.remove('open');
      websiteModal.setAttribute('aria-hidden', 'true');
      websiteModalVideo.src = '';
      websiteModalImage.classList.remove('active');
      websiteModalVideo.classList.remove('active');
      activeWebsiteItems = [];
      document.body.classList.remove('lightbox-open');
    }

    function showNextWebsiteItem() {
      if (!activeWebsiteItems.length) return;
      websiteIndex = (websiteIndex + 1) % activeWebsiteItems.length;
      updateWebsiteModal();
    }

    function showPreviousWebsiteItem() {
      if (!activeWebsiteItems.length) return;
      websiteIndex = (websiteIndex - 1 + activeWebsiteItems.length) % activeWebsiteItems.length;
      updateWebsiteModal();
    }

    websiteTriggers.forEach(function (trigger) {
      trigger.addEventListener('click', function () {
        openWebsiteModal(trigger.dataset.showcaseId, 0);
      });
    });

    // Allows deep-linking from other pages, e.g. graphic-design.html?showcase=idaho-sky
    (function openShowcaseFromUrl() {
      if (!window.location.search) return;

      var params = new URLSearchParams(window.location.search);
      var showcaseId = params.get('showcase');
      if (!showcaseId) return;

      openWebsiteModal(showcaseId, 0);
    })();

    websiteModalClose.addEventListener('click', closeWebsiteModal);
    websiteModalPrev.addEventListener('click', showPreviousWebsiteItem);
    websiteModalNext.addEventListener('click', showNextWebsiteItem);

    websiteModal.addEventListener('click', function (event) {
      if (event.target === websiteModal) {
        closeWebsiteModal();
      }
    });

    websiteModal.addEventListener('wheel', function (event) {
      if (!websiteModal.classList.contains('open')) return;
      event.preventDefault();

      if (event.deltaY > 0) {
        showNextWebsiteItem();
      } else {
        showPreviousWebsiteItem();
      }
    }, { passive: false });

    websiteModal.addEventListener('touchstart', function (event) {
      if (!websiteModal.classList.contains('open')) return;
      if (event.touches.length !== 1) return;

      websiteTouchStartX = event.touches[0].clientX;
      websiteTouchStartY = event.touches[0].clientY;
    }, { passive: true });

    websiteModal.addEventListener('touchend', function (event) {
      if (!websiteModal.classList.contains('open')) return;
      if (event.changedTouches.length !== 1) return;

      var deltaX = event.changedTouches[0].clientX - websiteTouchStartX;
      var deltaY = event.changedTouches[0].clientY - websiteTouchStartY;

      if (Math.abs(deltaX) < 40 || Math.abs(deltaX) < Math.abs(deltaY)) return;

      if (deltaX < 0) {
        showNextWebsiteItem();
      } else {
        showPreviousWebsiteItem();
      }
    }, { passive: true });

    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && websiteModal.classList.contains('open')) {
        closeWebsiteModal();
      }

      if (websiteModal.classList.contains('open') && event.key === 'ArrowRight') {
        showNextWebsiteItem();
      }

      if (websiteModal.classList.contains('open') && event.key === 'ArrowLeft') {
        showPreviousWebsiteItem();
      }
    });
  }

  // Chooses the gallery selector based on features present on each page.
  function getImageSelector() {
    if (document.querySelector('.website-showcase-trigger')) {
      return 'main .grid-item img:not([data-website-showcase])';
    }

    if (document.querySelector('.video-tile')) {
      return 'main .grid-item:not(.video-tile) img';
    }

    return 'main .grid-item img';
  }

  // ---------------------------------------------------------------------------
  // Contact form submission
  // ---------------------------------------------------------------------------
  function initContactForm() {
    var form = document.getElementById('contactForm');
    var statusEl = document.getElementById('contactFormStatus');

    if (!form || !statusEl) {
      return;
    }

    function setStatus(message, isError) {
      statusEl.textContent = message;
      statusEl.classList.remove('success', 'error');
      statusEl.classList.add(isError ? 'error' : 'success');
    }

    form.addEventListener('submit', function (event) {
      event.preventDefault();

      var submitButton = form.querySelector('button[type="submit"]');
      if (submitButton) {
        submitButton.disabled = true;
        submitButton.textContent = 'Sending...';
      }

      setStatus('Sending your message...', false);

      var formData = new FormData(form);
      var ajaxEndpoint = 'https://formsubmit.co/ajax/calebwardgraphicdesign@gmail.com';

      fetch(ajaxEndpoint, {
        method: 'POST',
        body: formData,
        headers: {
          Accept: 'application/json'
        }
      })
        .then(function (response) {
          if (!response.ok) {
            throw new Error('Request failed');
          }
          return response.json();
        })
        .then(function (result) {
          var isSuccess = result && (result.success === true || result.success === 'true' || result.message === 'success');
          if (isSuccess) {
            form.reset();
            setStatus('Message sent successfully. Thank you!', false);
            return;
          }

          throw new Error('Service returned an unexpected response');
        })
        .catch(function () {
          setStatus('Unable to send right now. Please try again or email calebwardgraphicdesign@gmail.com directly.', true);
        })
        .finally(function () {
          if (submitButton) {
            submitButton.disabled = false;
            submitButton.textContent = 'Send Message';
          }
        });
    });
  }

  // ---------------------------------------------------------------------------
  // Scroll-to-top button
  // ---------------------------------------------------------------------------
  function initScrollToTop() {
    var scrollButton = document.createElement('button');
    scrollButton.type = 'button';
    scrollButton.className = 'scroll-top-btn';
    scrollButton.setAttribute('aria-label', 'Scroll to top');
    scrollButton.textContent = 'Top';
    document.body.appendChild(scrollButton);

    function pageNeedsScrollButton() {
      return document.documentElement.scrollHeight > window.innerHeight + 140;
    }

    function updateScrollButton() {
      var shouldShow = pageNeedsScrollButton() && window.scrollY > 340;
      scrollButton.classList.toggle('is-visible', shouldShow);
    }

    scrollButton.addEventListener('click', function () {
      window.scrollTo({
        top: 0,
        behavior: 'smooth'
      });
    });

    window.addEventListener('scroll', updateScrollButton, { passive: true });
    window.addEventListener('resize', updateScrollButton);
    updateScrollButton();
  }

  // ---------------------------------------------------------------------------
  // Bootstrapping
  // ---------------------------------------------------------------------------
  document.addEventListener('DOMContentLoaded', function () {
    // Modules self-guard when expected markup is missing, so this can run site-wide.
    createImageLightbox(getImageSelector());
    initWebsiteShowcase();

    var videoModalApi = createVideoModal();
    initVideoTiles(videoModalApi);
    initCampusTourTiles(videoModalApi);
    initScrollToTop();
    initContactForm();
  });
})();
