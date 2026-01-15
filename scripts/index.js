const btnUp = document.querySelector(".up");
const leftCursor = document.querySelector('.cursor__left');
const rightCursor = document.querySelector('.cursor__right');
const slider = document.querySelector('.slider');
//const sliderFirst = document.querySelector('.slider__first-pack')
//const sliderSecond = document.querySelector('.slider__second-pack');
const sliderPacks = document.querySelectorAll('.slider__pack');
const partnersIcons = document.querySelectorAll(".partners__slider");
const visualLeft = document.querySelector(".visual__left-arrow");
const visualRight = document.querySelector(".visual__right-arrow");
const visualFirstItem = document.querySelector(".visual__blocks");
const visualSecondItem = document.querySelector(".visual__blocks-2");
const visualPoint = document.querySelector(".visual__point");
const visualPoint2 = document.querySelector(".visual__point-active");
const visualModal = document.querySelector(".visual__modal");
//const visualModalEsc = document.querySelector(".visual__modal-esc");
const visualContainer = document.querySelector('.visual__container');


const modal = document.getElementById('myModal');
const modal2 = document.getElementById('myModal2');
const modal3 = document.getElementById('myModal3');
const modal4 = document.getElementById('myModal4');
const img = document.querySelector('.cert1');
const img2 = document.querySelector('.cert2');
const img3 = document.querySelector('.cert3');
const img4 = document.querySelector('.cert4');
const modalImg = document.getElementById("img01");
const modalImg2 = document.getElementById("img02");
const modalImg3 = document.getElementById("img03");
const modalImg4 = document.getElementById("img04");
const captionText = document.getElementById("caption");
const captionText2 = document.getElementById("caption2");
const captionText3 = document.getElementById("caption3");
const captionText4 = document.getElementById("caption4");

const boxArrowLeft = document.querySelector(".box-left");
const boxArrowRigth = document.querySelector(".box-right");

const numYear = document.querySelector('.info__num-year');
const numProjects = document.querySelector('.info__num-projects');
const numLicence = document.querySelector('.info__num-licence');

const closeElems = document.querySelectorAll('.closeElem');

img.addEventListener("click", () => getModal(modal, modalImg, captionText, img));
img2.addEventListener("click", () => getModal(modal2, modalImg2, captionText2, img2));
img3.addEventListener("click", () => getModal(modal3, modalImg3, captionText3, img3));
img4.addEventListener("click", () => getModal(modal4, modalImg4, captionText4, img4));

function getModal(modalElem, modalImg, text, originalImg) {
    modalElem.style.display = "block";
    modalImg.src = originalImg.src;
    text.innerHTML = originalImg.alt;
}

const span = document.getElementsByClassName("close")[0];
const span2 = document.getElementsByClassName("close2")[0];
const span3 = document.getElementsByClassName("close3")[0];
const span4 = document.getElementsByClassName("close4")[0];

span.addEventListener('click', () => closeModal(modal));
span2.addEventListener('click', () =>  closeModal(modal2));
span3.addEventListener('click', () =>  closeModal(modal3));
span4.addEventListener('click', () =>  closeModal(modal4));


document.querySelector("body").addEventListener("keydown", e => {
    if(e.key === "Escape") {
        close(closeElems);
    }
});


const infoBlocks = document.querySelector('.info__blocks');

const callback = (entries, observer) => {
    entries.forEach(entry => {
        if(entry.isIntersecting) {
            animate(numYear, 20);
            animate(numProjects, 1);
            animate(numLicence, 1);
            observer.unobserve(entry.target);
        }
    });
}

const options = {
    rootMargin: "0px",
    threshold: 1
};

const observer = new IntersectionObserver(callback, options);
observer.observe(infoBlocks);

function animate(domElement, timeInterval) {
    let start = Number(domElement.innerHTML);
    const end = domElement.dataset.max;
    let interval = setInterval(() => {
        domElement.innerHTML = ++start;
        if(start == end) {
            clearInterval(interval);
        }
    }, timeInterval);
}

const close = elements => {
    elements.forEach(element => {
        closeModal(element);
    });
}

const closeModal = closeElement => closeElement.style.display = "none";

btnUp.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
});

//leftCursor.addEventListener('click', moveLeftCarousel);
//rightCursor.addEventListener('click', moveRightCarousel)

function moveRightCarousel() {
    if(sliderSecond.style.display = "none") {
        sliderSecond.style.display = "flex";
        sliderSecond.style.justifyContent = "space-between";
        sliderSecond.style.alignItems = "center";
        sliderFirst.style.display = "none";
        slider.style.maxWidth = "100%";
    }
}

function moveLeftCarousel() {
    if(sliderFirst.style.display = "none") {
        sliderFirst.style.display = "flex";
        sliderFirst.style.justifyContent = "space-between";
        sliderFirst.style.alignItems = "center";
        sliderSecond.style.display = "none";
        slider.style.maxWidth = "712px";
    }
}



/*class Slider {
    constructor(ribbon, prev, next) {
      this.ribbon = document.getElementById(ribbon);
      this.prev = document.getElementById(prev);
      this.next = document.getElementById(next);
      this.clone = document.createElement(this.ribbon.lastElementChild.cloneNode(true).tagName);
      this.direction = 0;

      this.runSlider = function() {
        this.prev.addEventListener('click', this.switchSlide);
        this.next.addEventListener('click', this.switchSlide);
        this.ribbon.addEventListener('transitionend', this.onTransitionEnd);
        }
      }

      onTransitionEnd = () => {
        if ( this.direction === -1 ) {
          this.ribbon.appendChild(this.ribbon.firstElementChild)
          this.ribbon.style.transition = 'none';
          this.ribbon.style.transform = 'translateX(-186%)';
          setTimeout(() => {
              this.ribbon.style.transition = 'all ease 0.5s';
          });

        } else if ( this.direction === 1 ) {
            this.ribbon.prepend(this.ribbon.lastElementChild);

            this.ribbon.style.transition = 'none';

            this.ribbon.style.transform = 'translateX(-186%)';
            setTimeout(() => {
               this.ribbon.style.transition = 'all ease 0.5s';
            })
        }
      };

      switchSlide = (e) => {
        if ( e.currentTarget.id === this.next.id ) {
          this.direction = -1;
          this.ribbon.style.transform = `translateX(-${296}%)`;

       } else if ( e.currentTarget.id === this.prev.id ) {
          this.direction = 1;
          this.ribbon.style.transform = `translateX(-${76}%)`;
          console.log(this.ribbon.style.transform)

      }
    }
}

const createSlider = new Slider('ribbon', 'prev', 'next').runSlider();
*/

// Загрузка новостей для главной страницы
async function loadMainPageNews() {
    try {
        const response = await fetch('https://scadaint.ru/api/public/news?limit=6');
        const data = await response.json();

        if (data.success) {
            renderNews(data.news);
        } else {
            showNewsError();
        }
    } catch (error) {
        console.error('Error loading news:', error);
        showNewsError();
    }
}

// Отображение новостей на странице
function renderNews(news) {
    const newsContainer = document.querySelector('.news__blocks');

    if (!newsContainer) return;

    newsContainer.innerHTML = news.map(item => `
        <div class="news-hover">
            <div class="news__block">
                ${item.image_path ? `
                    <picture>
                        <img loading="lazy" height="250" class="news__block-image"
                             src="server${item.image_path}" alt="${item.title}" width="350">
                    </picture>
                ` : 'xxxx'}
                <h3 class="news__block-title">${item.title}</h3>
                <p class="news__block-text">${item.short_text}</p>
                <a href="/news.html?id=${item.id}" class="news__block-link">
                    Читать далее
                </a>
                ${item.external_link ? `
                    <a href="${item.external_link}" target="_blank"
                       class="news__block-external-link">
                        Подробнее на сайте
                    </a>
                ` : ''}
                <p class="news__block-date">${item.created_at}</p>
            </div>
        </div>
    `).join('');
}

// Обработка ошибки загрузки новостей
function showNewsError() {
    const newsContainer = document.querySelector('.news__blocks');
    if (newsContainer) {
        newsContainer.innerHTML = `
            <div class="news-error">
                Не удалось загрузить новости. Пожалуйста, попробуйте позже.
            </div>
        `;
    }
}

// Загрузка полной новости на отдельной странице
async function loadFullNews() {
    const urlParams = new URLSearchParams(window.location.search);
    const newsId = urlParams.get('id');

    if (!newsId) return;

    try {
        const response = await fetch(`https://scadaint.ru/api/public/news/${newsId}`);
        const data = await response.json();

        if (data.success) {
            renderFullNews(data.news);
        } else {
            showFullNewsError();
        }
    } catch (error) {
        console.error('Error loading news:', error);
        showFullNewsError();
    }
}

// Отображение полной новости
function renderFullNews(news) {
    document.getElementById('news-title').textContent = news.title;
    document.getElementById('news-date').textContent = news.created_at;

    const imageContainer = document.getElementById('news-image');
    if (news.image_path) {
        imageContainer.innerHTML = `
            <img src="${news.image_path}" alt="${news.title}"
                 class="news-detail-image">
        `;
    }

    document.getElementById('news-text').innerHTML = `
        <p>${news.full_text.replace(/\n/g, '</p><p>')}</p>
    `;

    if (news.external_link) {
        document.getElementById('news-external-link').innerHTML = `
            <a href="/final/${news.external_link}" target="_blank"
               class="external-link">
                Подробнее на сайте
            </a>
        `;
    }
}

// Инициализация при загрузке страницы
document.addEventListener('DOMContentLoaded', () => {
    // Главная страница
    if (document.querySelector('.news__blocks')) {
        loadMainPageNews();
    }

    // Страница полной новости
    if (document.getElementById('news-detail')) {
        loadFullNews();
    }
});
