const animeForm = document.getElementById('anime-form');
const animeTitleInput = document.getElementById('anime-title');
// Removed genre input as user shouldn't add genre manually
const animeList = document.getElementById('list');
const recommendationList = document.getElementById('recommendation-list');
const pagination = document.getElementById('pagination');
const stars = document.querySelectorAll('#star-rating .star');

let watchedAnime = JSON.parse(localStorage.getItem('watchedAnime')) || [];

// Pagination config
const itemsPerPage = 20;
let currentPage = 1;

// Star rating UI logic
let selectedRating = 0;
stars.forEach(star => {
  star.addEventListener('mouseover', () => {
    const val = parseInt(star.getAttribute('data-value'));
    highlightStars(val);
  });

  star.addEventListener('mouseout', () => {
    highlightStars(selectedRating);
  });

  star.addEventListener('click', () => {
    selectedRating = parseInt(star.getAttribute('data-value'));
    highlightStars(selectedRating);
  });
});

function highlightStars(rating) {
  stars.forEach(star => {
    const val = parseInt(star.getAttribute('data-value'));
    star.classList.toggle('selected', val <= rating);
  });
}
highlightStars(selectedRating); // Initialize

// Fetch anime data from Kitsu API including genres, with caching
async function fetchAnimeData(title) {
  const cacheKey = `anime_${title.toLowerCase()}`;
  const cached = localStorage.getItem(cacheKey);
  if (cached) {
    return JSON.parse(cached);
  }

  const url = `https://kitsu.io/api/edge/anime?filter[text]=${encodeURIComponent(title)}`;
  try {
    const response = await fetch(url);
    const data = await response.json();
    if (data.data.length > 0) {
      const anime = data.data[0];
      // Fetch genres separately
      const genresUrl = anime.relationships.genres.links.related;
      const genresResponse = await fetch(genresUrl);
      const genresData = await genresResponse.json();
      const genres = genresData.data.map(genre => genre.attributes.name.toLowerCase());

      const animeData = {
        title: anime.attributes.titles.en || anime.attributes.titles.en_jp || anime.attributes.titles.ja_jp,
        image: anime.attributes.posterImage.medium,
        genres: genres.length > 0 ? genres : ['unknown']
      };

      localStorage.setItem(cacheKey, JSON.stringify(animeData));
      return animeData;
    } else {
      return null;
    }
  } catch (error) {
    console.error('Error fetching anime data:', error);
    return null;
  }
}

// Display pagination buttons below the anime list
function displayPaginationControls(totalItems) {
  pagination.innerHTML = '';
  const totalPages = Math.ceil(totalItems / itemsPerPage);
  if (totalPages <= 1) return; // no need for pagination if only 1 page

  for (let i = 1; i <= totalPages; i++) {
    const btn = document.createElement('button');
    btn.textContent = i;
    btn.disabled = (i === currentPage);
    btn.addEventListener('click', () => {
      currentPage = i;
      displayAnime();
    });
    pagination.appendChild(btn);
  }
}

// Display watched anime with images and genre and rating stars, paginated
async function displayAnime() {
  animeList.innerHTML = '';
  const start = (currentPage - 1) * itemsPerPage;
  const end = start + itemsPerPage;
  const pageItems = watchedAnime.slice(start, end);

  for (const anime of pageItems) {
    const animeData = await fetchAnimeData(anime.title);
    const li = document.createElement('li');

    if (animeData) {
      li.innerHTML = `
        <img src="${animeData.image}" alt="${animeData.title} Poster" class="anime-poster" />
        <span>${animeData.title} (${animeData.genres.join(', ')}) - Rating: ${'⭐'.repeat(anime.rating)}</span>
      `;
    } else {
      li.textContent = `${anime.title} (${anime.genre || 'unknown'}) - Image not found - Rating: ${'⭐'.repeat(anime.rating)}`;
    }

    animeList.appendChild(li);
  }
  
  displayPaginationControls(watchedAnime.length);
}

// Calculate weighted genres based on ratings
function getWeightedGenres() {
  const genreScores = {};
  watchedAnime.forEach(anime => {
    if (!anime.genre || !anime.rating) return;
    genreScores[anime.genre] = (genreScores[anime.genre] || 0) + anime.rating;
  });

  // Sort genres by weighted score descending
  const sortedGenres = Object.entries(genreScores).sort((a, b) => b[1] - a[1]);
  return sortedGenres.map(g => g[0]);
}

// Fetch recommendations dynamically from Kitsu API by genres with pagination
async function fetchRecommendationsByGenres(genres, limit = 10, offset = 0) {
  if (genres.length === 0) return [];

  // Use first genre for recommendation
  const genre = genres[0];

  // Note: Kitsu API doesn't have direct genre filter, using category filter workaround
  const url = `https://kitsu.io/api/edge/anime?filter[categories]=${encodeURIComponent(genre)}&page[limit]=${limit}&page[offset]=${offset}&sort=-popularityRank`;

  try {
    const response = await fetch(url);
    const data = await response.json();
    return data.data.map(anime => ({
      title: anime.attributes.titles.en || anime.attributes.titles.en_jp || anime.attributes.titles.ja_jp,
      image: anime.attributes.posterImage.medium,
      genres: [genre]
    }));
  } catch (error) {
    console.error('Error fetching recommendations:', error);
    return [];
  }
}

let recOffset = 0;
const recLimit = 10;

async function displayRecommendations() {
  recommendationList.innerHTML = '';
  const genres = getWeightedGenres();
  recOffset = 0;
  const recs = await fetchRecommendationsByGenres(genres, recLimit, recOffset);

  recs.forEach(rec => {
    const li = document.createElement('li');
    li.innerHTML = `
      <img src="${rec.image}" alt="${rec.title} Poster" class="anime-poster" />
      <span>${rec.title}</span>
    `;
    recommendationList.appendChild(li);
  });

  // Add "Load More" button if more recs can be loaded
  if (recs.length === recLimit) {
    const loadMoreBtn = document.createElement('button');
    loadMoreBtn.textContent = 'Load More';
    loadMoreBtn.addEventListener('click', async () => {
      recOffset += recLimit;
      const moreRecs = await fetchRecommendationsByGenres(genres, recLimit, recOffset);
      moreRecs.forEach(rec => {
        const li = document.createElement('li');
        li.innerHTML = `
          <img src="${rec.image}" alt="${rec.title} Poster" class="anime-poster" />
          <span>${rec.title}</span>
        `;
        recommendationList.appendChild(li);
      });
      if (moreRecs.length < recLimit) {
        loadMoreBtn.remove();
      }
    });
    recommendationList.appendChild(loadMoreBtn);
  }
}

animeForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const title = animeTitleInput.value.trim();

  if (!title) {
    alert('Please enter an anime title.');
    return;
  }

  if (selectedRating === 0) {
    alert('Please select a star rating.');
    return;
  }

  const animeData = await fetchAnimeData(title);

  if (animeData) {
    // Use first genre for recommendations
    const mainGenre = animeData.genres[0];
    watchedAnime.push({ title: animeData.title, genre: mainGenre, rating: selectedRating });
    localStorage.setItem('watchedAnime', JSON.stringify(watchedAnime));

    currentPage = Math.ceil(watchedAnime.length / itemsPerPage); // jump to last page after add
    await displayAnime();
    await displayRecommendations();
  } else {
    alert('Anime not found. Please try another title.');
  }

  animeForm.reset();
  selectedRating = 0;
  highlightStars(0);
});

// Initial display on page load
displayAnime();
displayRecommendations();
