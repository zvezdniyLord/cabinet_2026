document.addEventListener("DOMContentLoaded", function () {
  setupFormSubmission();
  attachEventHandlers();
  setupDistributedSystemHandlers();
  manageQuestionnaires();
  handleDynamicConfigurations();
  setupDistributedSystemFormSubmission();
  validateInputFields();
});
document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("formOne");
  form.addEventListener("submit", function (event) {
    validateInputFields();
    event.preventDefault(); // Предотвращаем стандартную отправку формы
    try {
      const formData = collectFormData(form);
      exportToExcel(formData); // Экспорт данных в Excel
    } catch (error) {
      console.error("Ошибка при обработке данных:", error);
      alert("Произошла ошибка при обработке данных.");
    }
  });
});
function validateInputFields() {
  const inputs = document.querySelectorAll("input[list]");
  let isValid = true;

  inputs.forEach(function (input) {
    const value = input.value.trim();

    if (!/^\d+$/.test(value) && value !== "Нет" && value !== "") {
      input.classList.add("invalid");
      isValid = false;
    } else {
      input.classList.remove("invalid");
    }
  });

  if (!isValid) {
    alert("Пожалуйста, исправьте ошибки в полях (только числа или 'Нет').");
  }

  return isValid;
}
let pollCount = 0;
// valid fields
function validateFormOneWithValidation() {
  const form = document.getElementById("formOne");
  if (!form) return false;

  let isValid = true;
  const emptyFields = [];

  // Сброс предыдущих ошибок
  form
    .querySelectorAll(".invalid")
    .forEach((el) => el.classList.remove("invalid"));

  // === 1. Валидация обязательных текстовых полей ===
  const requiredFields = form.querySelectorAll("input.required");
  requiredFields.forEach((field) => {
    if (
      (field.type === "text" ||
        field.type === "email" ||
        field.type === "tel") &&
      !field.value.trim()
    ) {
      const label =
        field
          .closest(".form__question")
          ?.querySelector(".form__input-name")
          ?.innerText.trim() ||
        field.name ||
        "Поле";
      emptyFields.push(label);

      field.classList.add("invalid");
      isValid = false;
    }
  });

  // === 2. Проверка формата email ===
  const emailInput = form.querySelector('input[name="Почта"]');
  if (emailInput && emailInput.value.trim()) {
    const emailPattern = /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]/i;
    if (!emailPattern.test(emailInput.value)) {
      emailInput.classList.add("invalid");
      emptyFields.push("Почта — неверный формат");
      isValid = false;
    }
  }

  // === 3. Проверка формата телефона ===
  const phoneInput = form.querySelector('input[name="Телефон"]');
  if (phoneInput && phoneInput.value.trim()) {
    const phonePattern = /^8[0-9]{3}[0-9]{3}[0-9]{2}[0-9]{2}$/;
    if (!phonePattern.test(phoneInput.value)) {
      phoneInput.classList.add("invalid");
      emptyFields.push("Телефон — неверный формат");
      isValid = false;
    }
  }

  // === 4. Сообщение об ошибках ===
  if (emptyFields.length > 0) {
    alert(
      `Пожалуйста, исправьте ошибки:\nСледующие поля заполнены некорректно или не заполнены:\n- ${emptyFields.join(
        "\n- "
      )}`
    );
    isValid = false;
  }

  return isValid;
}

// === Блок управления динамическими элементами ===
function attachEventHandlers() {
  handleCombinedSelects();
  handleAdditionalDrivers();
  handleVisualizationBlocks();
  handleRootUserBlocks();
  handleSignalHistory();
}
//  === Обработчики selectов ===
function handleCombinedSelects() {
  document.querySelectorAll(".dataSignal").forEach((select) => {
    select.addEventListener("change", function () {
      const parentBlock =
        select.closest(".form__question") || select.closest("div");
      const driverBlocks = parentBlock
        ? parentBlock.parentElement.querySelectorAll(".dopDrivers")
        : [];
      const additionalDriversBlocks = parentBlock
        ? parentBlock.parentElement.querySelectorAll(
            ".additional-drivers-block"
          )
        : [];

      if (select.value !== "нет" && select.value !== "") {
        driverBlocks.forEach((block) => (block.style.display = "block"));
      } else {
        driverBlocks.forEach((block) => {
          block.style.display = "none";
          block
            .querySelectorAll("select")
            .forEach((nestedSelect) => (nestedSelect.value = "нет"));
        });
        additionalDriversBlocks.forEach((block) => {
          block.style.display = "none";
          block
            .querySelectorAll("input[type='checkbox']")
            .forEach((checkbox) => (checkbox.checked = false));
        });
      }
    });
  });
}
function handleAdditionalDrivers() {
  document.querySelectorAll("#additionalDrivers").forEach((select, index) => {
    const additionalDriversBlocks = document.querySelectorAll(
      ".additional-drivers-block"
    );

    select.addEventListener("change", function () {
      const block = additionalDriversBlocks[index];
      if (select.value === "Да") {
        block.style.display = "block";
      } else {
        block.style.display = "none";
        block
          .querySelectorAll("input[type='checkbox']")
          .forEach((checkbox) => (checkbox.checked = false));
      }
    });
  });
}
function handleVisualizationBlocks() {
  document.querySelectorAll("#FatClient").forEach((select, index) => {
    const visualizationBlocks = document.querySelectorAll(
      ".VisualizationBlock"
    );

    select.addEventListener("change", function () {
      const block = visualizationBlocks[index];
      if (select.value !== "Нет") {
        block.style.display = "block";
      } else {
        block.style.display = "none";
        block
          .querySelectorAll("select")
          .forEach((nestedSelect) => (nestedSelect.value = "нет"));
      }
    });
  });
}
function handleRootUserBlocks() {
  document.querySelectorAll("#RootUser").forEach((select, index) => {
    const rootUserBlocks = document.querySelectorAll(".RootUserBlock");

    select.addEventListener("change", function () {
      const block = rootUserBlocks[index];
      if (select.value === "Да") {
        block.style.display = "block";
      } else {
        block.style.display = "none";
        block
          .querySelectorAll("select")
          .forEach((nestedSelect) => (nestedSelect.value = "нет"));
      }
    });
  });
}
function handleSignalHistory() {
  document
    .querySelectorAll(
      'select[name="Сохранение данных в историю, количество сигналов:"]'
    )
    .forEach((select) => {
      const serversBlock = select.closest("form").querySelector(".Servers");

      if (!serversBlock) return;

      function toggleServersBlock() {
        serversBlock.style.display =
          select.value.toLowerCase() !== "нет" ? "block" : "none";
      }

      toggleServersBlock();
      select.addEventListener("change", toggleServersBlock);
    });
}

// === Блок управления опросниками ===
function manageQuestionnaires() {
  const questionnaireTriggers = document.querySelectorAll(
    '[id^="openQuestionnaire"]'
  );
  const questionnaireSections = document.querySelectorAll(
    '[id^="questionnaire"]'
  );

  questionnaireTriggers.forEach((trigger) => {
    trigger.addEventListener("click", function () {
      const sectionNumber = this.id.replace("openQuestionnaire", "");
      const targetSectionId = "questionnaire" + sectionNumber;

      questionnaireSections.forEach(
        (section) => (section.style.display = "none")
      );

      const targetSection = document.getElementById(targetSectionId);
      if (targetSection) targetSection.style.display = "block";
    });
  });
}

// === Блок динамического создания конфигураций ===
function handleDynamicConfigurations() {
  const container = document.querySelector("#questionnaire1");
  let formCount = 1;

  function addNewConfiguration() {
    document.querySelectorAll(".send-hid").forEach((button) => {
      button.style.display = "none";
    });
    const originalForm = document.querySelector(".form__questionnaireTwo");
    const newForm = originalForm.cloneNode(true);

    // Очистка значений в новой конфигурации
    newForm.querySelectorAll("input, select").forEach((el) => {
      if (el.tagName === "SELECT") {
        el.value = "Нет"; // Устанавливаем значение "Нет" для всех select
      } else if (el.type === "checkbox" || el.type === "radio") {
        el.checked = false;
      } else {
        el.value = "";
      }
    });
    // Скрытие всех дополнительных блоков
    newForm
      .querySelectorAll(
        ".VisualizationBlock, .RootUserBlock, .additional-drivers-block, .dopDrivers, .Servers"
      )
      .forEach((block) => {
        block.style.display = "none";
      });

    // Прикрепление обработчиков событий к новой форме
    attachEventHandlersToForm(newForm);

    // Удаление кнопки "Отправить" из предыдущей формы
    if (formCount > 1) {
      const lastForm = container.lastElementChild;
      const lastSubmitButton = lastForm.querySelector(".send-hid");
      if (lastSubmitButton) {
        lastSubmitButton.remove();
      }
    }

    // Добавление новой формы в контейнер
    container.appendChild(newForm);
    // Добавление кнопки "Отправить" только в последнюю форму
    const newSubmitButton = document.createElement("button");
    newSubmitButton.type = "button";
    newSubmitButton.className = "send-hid btn__questionnaire-send";
    newSubmitButton.textContent = "Отправить";
    validateInputFields();

    newSubmitButton.addEventListener("click", handleFormSubmission);
    newForm.appendChild(newSubmitButton);

    formCount++;
  }
  function handleFormSubmission() {
    // Добавляем новую проверку validateInputFields()
    if (validateFormOneWithValidation() && validateInputFields()) {
      try {
        const allData = collectAllFormDataWithFormOne();
        exportAllToExcel(allData); // Экспорт данных в Excel
      } catch (error) {
        console.error("Ошибка при обработке данных:", error);
        alert("Произошла ошибка при обработке данных.");
      }
    } else {
      console.warn("Форма не прошла валидацию");
      alert("Пожалуйста, исправьте ошибки в форме перед отправкой.");
    }
  }

  function attachEventHandlersToForm(form) {
    form.querySelectorAll(".course-checkbox").forEach((checkbox) => {
      checkbox.addEventListener("change", () => {
        // Сборка всех выбранных программ обучения
        const courseCheckboxes = form.querySelectorAll(".course-checkbox");
        const selectedCourses = [];

        courseCheckboxes.forEach((cb) => {
          if (cb.checked && cb.dataset.courseName) {
            selectedCourses.push(cb.dataset.courseName);
          }
        });

        // Обновление поля "Программы обучения"
        let programsField = form.querySelector('[name="Программы обучения"]');

        if (!programsField) {
          // Если поля нет — создаём скрытое поле для хранения значения
          programsField = document.createElement("input");
          programsField.type = "hidden";
          programsField.name = "Программы обучения";
          form.appendChild(programsField);
        }

        programsField.value =
          selectedCourses.length > 0 ? selectedCourses.join(", ") : "Нет";

        console.log("Обновленные программы обучения:", programsField.value);
      });
    });
    handleCombinedSelectsInForm(form);
    handleAdditionalDriversInForm(form);
    handleVisualizationBlocksInForm(form);
    handleRootUserBlocksInForm(form);
  }
  //  === Отрисовка скрытых блоков по selectу ===
  function handleCombinedSelectsInForm(form) {
    form.querySelectorAll(".dataSignal").forEach((select) => {
      select.addEventListener("change", function () {
        const parentBlock = select.closest(".form__question");
        const driverBlocks =
          parentBlock.parentElement.querySelectorAll(".dopDrivers");
        const additionalDriversBlocks =
          parentBlock.parentElement.querySelectorAll(
            ".additional-drivers-block"
          );

        if (select.value !== "нет" && select.value !== "") {
          driverBlocks.forEach((block) => (block.style.display = "block"));
        } else {
          driverBlocks.forEach((block) => {
            block.style.display = "none";
            block
              .querySelectorAll("select")
              .forEach((nestedSelect) => (nestedSelect.value = "нет"));
          });
          additionalDriversBlocks.forEach((block) => {
            block.style.display = "none";
            block
              .querySelectorAll("input[type='checkbox']")
              .forEach((checkbox) => (checkbox.checked = false));
          });
        }
      });
    });
  }

  function handleAdditionalDriversInForm(form) {
    form
      .querySelectorAll("[id^=additionalDrivers]")
      .forEach((select, index) => {
        const additionalDriversBlocks = form.querySelectorAll(
          ".additional-drivers-block"
        );

        select.addEventListener("change", function () {
          const block = additionalDriversBlocks[index];
          if (select.value === "Да") {
            block.style.display = "block";
          } else {
            block.style.display = "none";
            block
              .querySelectorAll("input[type='checkbox']")
              .forEach((checkbox) => (checkbox.checked = false));
          }
        });
      });
  }

  function handleVisualizationBlocksInForm(form) {
    form.querySelectorAll("#FatClient").forEach((select) => {
      select.addEventListener("change", function () {
        const visualizationBlock =
          select.closest(".form__question").nextElementSibling;
        if (select.value !== "Нет") {
          visualizationBlock.style.display = "block";
        } else {
          visualizationBlock.style.display = "none";
          visualizationBlock
            .querySelectorAll("input[type='checkbox']")
            .forEach((checkbox) => {
              checkbox.checked = false;
            });
        }
      });
    });
  }

  function handleRootUserBlocksInForm(form) {
    form.querySelectorAll("#RootUser").forEach((select, index) => {
      const rootUserBlocks = form.querySelectorAll(".RootUserBlock");

      select.addEventListener("change", function () {
        const block = rootUserBlocks[index];
        if (select.value === "Да") {
          block.style.display = "block";
        } else {
          block.style.display = "none";
          block
            .querySelectorAll("select")
            .forEach((nestedSelect) => (nestedSelect.value = "нет"));
        }
      });
    });
  }

  container.addEventListener("click", (event) => {
    if (event.target.classList.contains("add-config")) {
      event.preventDefault();
      event.target.classList.add("hidden");
      addNewConfiguration();
    }
  });
}
//
//  === Отрисовка блока с обучением ===
function setupDistributedSystemHandlers() {
  const distributedSection = document.querySelector("#questionnaire3");
  if (!distributedSection) return;

  const controlPointInput = distributedSection.querySelector("#ControlPoint");
  const licenseBlock = distributedSection
    .querySelector("#licensingType")
    .closest(".form__q__hidden");
  const educationBlock = distributedSection
    .querySelector(".educated__program")
    .closest(".form__q__hidden");
  const submitButton = distributedSection.querySelector(
    ".btn__questionnaire-send"
  );

  function toggleBlocksVisibility() {
    const pointCount = parseInt(controlPointInput.value, 10);
    const shouldShowBlocks = !isNaN(pointCount) && pointCount > 0;

    [licenseBlock, educationBlock, submitButton].forEach((block) => {
      block.style.display = shouldShowBlocks ? "block" : "none";
    });
  }

  toggleBlocksVisibility();

  controlPointInput.addEventListener("input", () => {
    toggleBlocksVisibility();
  });
}

createDistributedSystemPolls();

// Функция для сбора данных из формы
function collectFormData(form) {
  const formData = {};

  // Сбор обычных полей
  form.querySelectorAll("input, select").forEach((input) => {
    let value;

    if (input.type === "checkbox") {
      value = input.checked ? "Да" : "Нет";
    } else if (input.tagName === "SELECT") {
      value = input.value;
    } else {
      value = input.value || "Нет";
    }

    const label =
      input
        .closest(".form__question")
        ?.querySelector(".form__input-name, .form__input-name-inside")
        ?.innerText.trim() || input.name;
    formData[label] = value;
  });

  // Сбор программ обучения
  const courseCheckboxes = form.querySelectorAll(".course-checkbox");
  const selectedCourses = [];

  courseCheckboxes.forEach((checkbox) => {
    if (checkbox.checked && checkbox.dataset.courseName) {
      selectedCourses.push(checkbox.dataset.courseName);
    }
  });

  if (selectedCourses.length > 0) {
    formData["Программы обучения"] = selectedCourses.join(", ");
  } else {
    formData["Программы обучения"] = "Нет";
  }
  console.log(formData);
  return formData;
}

// Обработчик отправки формы
function setupFormSubmission() {
  // Находим все формы конфигураций
  document.querySelectorAll(".form__questionnaireTwo").forEach((form) => {
    form.addEventListener("submit", function (event) {
      event.preventDefault(); // Предотвращаем стандартную отправку формы
      if (validateFormOneWithValidation() && validateInputFields()) {
        try {
          // Собираем данные из текущей формы
          const formData = collectFormData(form);

          // Добавляем общие данные из первой формы
          const commonData = collectFormData(
            document.getElementById("formOne")
          );
          const fullData = { ...commonData, ...formData };

          // Экспортируем данные в Excel
          if (exportToExcel(fullData)) {
          } else {
            alert("Произошла ошибка при экспорте данных");
          }
        } catch (error) {
          console.error("Ошибка при обработке данных:", error);
          alert(
            "Произошла ошибка при обработке данных. Пожалуйста, проверьте заполнение всех полей."
          );
        }
      }
    });
  });
}

// Функция для сбора данных из всех форм локальной системы
function collectAllLocalFormData() {
  const allForms = document.querySelectorAll(
    "#questionnaire1 .form__questionnaireTwo"
  );
  const allData = [];

  allForms.forEach((form, index) => {
    const formData = {};
    form.querySelectorAll("input, select").forEach((input) => {
      let value = "";
      if (input.type === "checkbox") {
        value = input.checked ? "Да" : "Нет";
      } else if (input.tagName === "SELECT") {
        value = input.value;
      } else {
        value = input.value || "Нет";
      }

      const label =
        input.closest(".form__question")?.querySelector(".form__input-name")
          ?.innerText || input.name;
      formData[label] = value;
    });

    // Добавляем данные текущей формы в массив
    allData.push({ ...formData, FormIndex: index + 1 }); // Добавляем номер формы
  });

  return allData;
}
function convertDataForExcel(data) {
  const result = [];

  for (const [question, answer] of Object.entries(data)) {
    if (Array.isArray(answer)) {
      answer.forEach((ans, index) => {
        result.push({
          Вопрос: index === 0 ? question : "", // Вопрос пишем только в первой строке
          Ответ: ans,
        });
      });
    } else {
      result.push({
        Вопрос: question,
        Ответ: answer,
      });
    }
  }

  return result;
}
function createDistributedSystemPolls() {
  const distributedSection = document.querySelector("#questionnaire3");
  if (!distributedSection) return;
  const controlPointInput = distributedSection.querySelector("#ControlPoint");
  const addedQuestsContainer =
    distributedSection.querySelector("#added__quests");
  let pollCount = 1;
  //  === Создание опроса распределенной системы ===
  function createPoll(index) {
    const pollDiv = document.createElement("div");
    pollDiv.className = "poll-container";
    pollDiv.setAttribute("data-poll-id", `poll-${index}`);
    pollDiv.innerHTML = `
    <section class="listing">
      <div class="form__question">
        <label class="form__input-name"
          >Сервер ввода-вывода, количество сигналов
          <p class="form__input-name-inside">
            Сбор данных по технологическим протоколам, математическая
            предобработка данных, генерация сообщений о событиях и авариях,
            предоставление данных сторонним системам и клиентским
            приложениям. В базовую поставку входят модули работы по OPC UA,
            модуль событий и модуль вычислений.
          </p>
        </label>
        <div style="display: flex; flex-direction: column">
                      <input
                type="text"
                list="dataSignalOptions"
                class="form__input-small dataSignal"
                id="dataSignal"
                name="Сбор данных по технологическим протоколам, математическая предобработка данных"
              
                placeholder="Введите число или 'Нет'"
              />

              <!-- Подсказки -->
              <datalist id="dataSignalOptions">
                <option value="Нет"></option>
                <option value="1000">1 000</option>
                <option value="2000">2 000</option>
                <option value="3000">3 000</option>
                <option value="5000">5 000</option>
                <option value="10000">10 000</option>
                <option value="15000">15 000</option>
                <option value="20000">20 000</option>
                <option value="25000">25 000</option>
                <option value="30000">30 000</option>
                <option value="40000">40 000</option>
                <option value="50000">50 000</option>
                <option value="75000">75 000</option>
                <option value="100000">100 000</option>
                <option value="150000">150 000</option>
                <option value="250000">250 000</option>
                <option value="500000">500 000</option>
                <option value="1000000">1 000 000</option>
                <option value="2000000">2 000 000</option>
              </datalist>
        </div>
      </div>
<div class="dopDrivers"  style="display: none">
    <div class="form__question">

  <label class="form__input-name">Требуется резервирование сервера</label>
  <select class="form__input-small" name="Требуется резервирование сервера">
    <option value="нет">Нет</option>
    <option value="Да">Да</option>
  </select>
</div>
</div>
<div class="dopDrivers"  style="display: none">
  <div class="form__question">
    <label class="form__input-name"
      >Нужны дополнительные драйверы для опроса устройств:<label
        class="star"
        >*</label
      ></label>
    <select
      class="form__input-small "
      id="additionalDrivers"
      name="Нужны дополнительные драйверы для опроса устройств"
    >
      <option value="Нет">Нет</option>
      <option value="Да">Да</option>
    </select>
  </div>
</div>
<div class="additional-drivers-block" style="display: none">
  <div class="form__question">
    <label class="form__input-name-inside"
      >Модуль ГОСТ Р МЭК 104 мастер:</label
    >
    <input
      type="checkbox"
      class="form__input-small"
      id="moduleGOST104Master"
      name="Модуль ГОСТ Р МЭК 104 мастер:"
    />
  </div>
  <div class="form__question">
    <label class="form__input-name-inside"
      >Модуль ГОСТ Р МЭК 104 слейв:</label
    >
    <input
      type="checkbox"
      class="form__input-small"
      id="moduleGOST104Slave"
      name="Модуль ГОСТ Р МЭК 104 слейв"
    />
  </div>
  <div class="form__question">
    <label class="form__input-name-inside"
      >Модуль Modbus TCP/IP мастер</label
    >
    <input
      type="checkbox"
      class="form__input-small"
      id="ModbusTCP/IP"
      name="Модуль Modbus TCP/IP мастер/IP"
    />
  </div>
  <div class="form__question">
    <label class="form__input-name-inside">Модуль Modbus RTU</label>
    <input
      type="checkbox"
      class="form__input-small"
      id="ModbusRTU"
      name="Модуль Modbus RTU"
    />
  </div>
  <div class="form__question">
    <label class="form__input-name-inside">Модуль SNMP </label>
    <input
      type="checkbox"
      class="form__input-small"
      id="SNMP"
      name="Модуль SNMP"
    />
  </div>
  <div class="form__question">
    <label class="form__input-name-inside">Модуль IEC 61850 MMS </label>
    <input
      type="checkbox"
      class="form__input-small"
      id="IEC61850MMS"
      name="Модуль IEC 61850 MMS"
    />
  </div>

  <div class="form__question">
    <label class="form__input-name-inside"
      >Модуль диагностики связи ICMP
    </label>
    <input
      type="checkbox"
      class="form__input-small"
      id="ICMP"
      name="Модуль диагностики связи ICMP"
    />
  </div>
  <div class="form__question">
    <label class="form__input-name-inside">Модуль статистики</label>
    <input
      type="checkbox"
      class="form__input-small"
      id="ModuleStatistics"
      name="Модуль статистики"
    />
  </div>
  <div class="form__question">
    <label class="form__input-name-inside"
      >Шлюз обмена данными со сторонними SQL базами.</label
    >
    <input
      type="checkbox"
      class="form__input-small"
      id="SQLTransfer"
      name="Шлюз обмена данными со сторонними SQL базами."
    />
  </div>
  <div class="form__question">
    <label class="form__input-name-inside">Modbus TCP режим Slave</label>
    <input
      type="checkbox"
      class="form__input-small"
      id="ModbusTCPSlave"
      name="Modbus TCP режим Slave"
    />
  </div>
  <div class="form__question">
    <label class="form__input-name-inside"
      >Шлюз обмена данными по протоколу MQTT</label
    >
    <input
      type="checkbox"
      class="form__input-small"
      id="MQTT"
      name="Шлюз обмена данными по протоколу MQTT"
    />
  </div>
  <div class="form__question">
    <label class="form__input-name-inside"
      >Шлюз предоставления данных опроса контроллера Siemens по протоколу
      S7</label
    >
    <input
      type="checkbox"
      class="form__input-small"
      id="SiemensS7"
      name="Шлюз предоставления данных опроса контроллера Siemens по протоколу S7"
    />
  </div>
  <div class="form__question">
    <label class="form__input-name-inside"
      >Шлюз обмена данных с контроллерами по протоколу EtherNet/IP</label
    >
    <input
      type="checkbox"
      class="form__input-small"
      id="EtherNet/IP"
      name="Шлюз обмена данными с контроллерами по протоколу EtherNet/IP"
    />
  </div>
</div>
<div class="form__question">
  <label class="form__input-name"
    >Сохранение данных в историю, количество сигналов:</label
  >
             <input
              type="text"
              list="signalCountHistoryList"
              class="form__input-small"
              id="signalCountHistory"
              name="Сохранение данных в историю, количество сигналов:"
              placeholder="Введите число или 'Нет'"
            />

            <!-- Подсказки -->
            <datalist id="signalCountHistoryList">
              <option value="Нет"></option>
              <option value="1000">1 000</option>
              <option value="2000">2 000</option>
              <option value="3000">3 000</option>
              <option value="5000">5 000</option>
              <option value="10000">10 000</option>
              <option value="15000">15 000</option>
              <option value="20000">20 000</option>
              <option value="25000">25 000</option>
              <option value="30000">30 000</option>
              <option value="40000">40 000</option>
              <option value="50000">50 000</option>
              <option value="75000">75 000</option>
              <option value="100000">100 000</option>
              <option value="150000">150 000</option>
              <option value="250000">250 000</option>
              <option value="500000">500 000</option>
              <option value="1000000">1 000 000</option>
              <option value="2000000">2 000 000</option>
            </datalist>
</div>
<div class="dopDrivers"  style="display: none">
    <div class="form__question">

  <label class="form__input-name"
    >Требуется резервирование сервера истории</label
  >
  <select
    class="form__input-small"
    id="RezervServer"
    name="Требуется резервирование сервера истории"
  >
    <option value="нет">Нет</option>
    <option value="Да">Да</option>
  </select>
</div>
</div>
<div class="dopDrivers"  style="display: none">
    <div class="form__question">

  <label class="form__input-name">Выделенные сервера истории</label>
  <select
    class="form__input-small"
    id="AddsServers"
    name="Выделенные сервера"
  >
    <option value="нет">Нет</option>
    <option value="Да">Да</option>
  </select>
</div>
</div>
<div class="form__question">
  <label class="form__input-name"
    >Требуется интеграция с внешней системой через шлюз транспорта данных,
    сервер ДМЗ, количество внешних подключений</label
  >

       <input
                type="text"
                list="OutputShluzList"
                class="form__input-small "
                id="OutputShluz"
                name="Требуется интеграция с внешней системой через шлюз транспорта данных, сервер ДМЗ, количество внешних подключений"
                placeholder="Введите число или 'Нет'"
              />

              <!-- Подсказки -->
              <datalist id="OutputShluzList">
                <option value="Нет"></option>
                  <option value="1">1</option>
    <option value="2">2</option>
    <option value="3">3</option>
    <option value="4">4</option>
    <option value="5">5</option>
    <option value="6">6</option>
    <option value="7">7</option>
    <option value="8">8</option>
    <option value="9">9</option>
    <option value="10">10</option>
              </datalist>
</div>

<div class="form__question">
  <label class="form__input-name"
    >Визуализация технологического процесса, толстый клиент, количество
    АРМ<label class="star">*</label></label
  >
  <select
    class="form__input-small"
    id="FatClient"
    name="Визуализация технологического процесса, толстый клиент"
  >
    <option value="нет">Нет</option>
    <option value="Да">Да</option>
  </select>
</div>
<div class="VisualizationBlock" style="display: none">
  <div class="form__question">
    <label class="form__input-name-inside"
      >Отображение оперативных и исторических событий в табличной форме</label
    >
    <input
      type="checkbox"
      class="form__input-small"
      id="TableForm"
      name="Отображение оперативных и исторических событий в табличной форме"
    />
  </div>
  <div class="form__question">
    <label class="form__input-name-inside"
      >Отображение в виде графиков изменений технологических
      параметров.</label
    >
    <input
      type="checkbox"
      class="form__input-small"
      id="GraphicsVis"
      name="Отображение в виде графиков изменений технологических параметров"
    />
  </div>
  <div class="form__question">
    <label class="form__input-name-inside">Формирование отчетов.</label>
    <input
      type="checkbox"
      class="form__input-small"
      id="Reports"
      name="Формирование отчетов"
    />
  </div>
  <div class="form__question">
    <label class="form__input-name-inside"
      >График зависимости одной величины от другой</label
    >
    <input
      type="checkbox"
      class="form__input-small"
      id="ValuesGraphic"
      name="График зависимости одной величины от другой"
    />
  </div>
  <div class="form__question">
    <label class="form__input-name-inside"
      >Просмотр видео с различных устройств</label
    >
    <input
      type="checkbox"
      class="form__input-small"
      id="VideoPlayer"
      name="Просмотр видео с различных устройств"
    />
  </div>
  <div class="form__question">
    <label class="form__input-name-inside"
      >Формирование критических архивов значений и событий</label
    >
    <input
      type="checkbox"
      class="form__input-small"
      id="CritArchive"
      name="Формирование критических архивов значений и событий"
    />
  </div>
  <div class="form__question">
    <label class="form__input-name-inside"
      >Уведомление пользователя о аварийных событиях посредством
      telegram:</label
    >
    <input
      type="checkbox"
      class="form__input-small"
      id="telegramNotification"
      name="Уведомление пользователя о аварийных событиях посредством telegram"
    />
  </div>
</div>
<div class="form__question">
  <label class="form__input-name"
    >Визуализация технологического процесса, тонкий клиент, количество
    конкурентных подключений
  </label>
                   <input
                type="text"
                list="VizConnectsList"
                class="form__input-small dataSignal"
                id="dataSignal"
                name="Визуализация технологического процесса, тонкий клиент, количество конкурентных подключений"
                placeholder="Введите число или 'Нет'"
              />

              <!-- Подсказки -->
              <datalist id="VizConnectsList">
                <option value="Нет"></option>
                             <option value="1">1</option>
              <option value="2">2</option>
              <option value="3">3</option>
              <option value="4">4</option>
              <option value="5">5</option>
              <option value="6">6</option>
              <option value="7">7</option>
              <option value="8">8</option>
              <option value="9">9</option>
              <option value="10">10</option>
              </datalist>
</div>
<div class="form__question">
  <label class="form__input-name"
    >Управление правами доступа пользователей к функциям клиентских
    приложений SCADA-системы, информационная безопасность<label class="star">*</label></label
  >
  <select
    class="form__input-small"
    id="RootUser"
    name="Управление правами доступа пользователей к функциям клиентских приложений SCADA-системы"
  >
    <option value="нет">Нет</option>
    <option value="Да">Да</option>
  </select>
</div>
<div class="RootUserBlock" style="display: none">
  <div class="form__question">
    <label class="form__input-name-inside"
      >Организация сбора диагностической информации по контролю целостности
      программной среды, событиям, файлам, папкам, службам и
      процессам.</label
    >
    <select
      class="form__input-small"
      id="
    collectionOfDiagnostic"
      name="Организация сбора диагностической информации по контролю целостности программной среды, событиям, файлам, папкам, службам и процессами."
    >
      <option value="нет">Нет</option>
      <option value="Да">Да</option>
    </select>
  </div>
  <div class="form__question">
    <label class="form__input-name-inside"
      >Аппаратная плата контроля системного блока ServSensor-01:</label
    >
    <select
      class="form__input-small"
      id="servSensor"
      name="Аппаратная плата контроля системного блока ServSensor-01"
    >
      <option value="Нет">Нет</option>
      <option value="Да">Да</option>
    </select>
  </div>
  <div class="form__question">
    <label class="form__input-name-inside"
      >IntegrityGUARD аппаратная плата контроля системного блока с выводом информации в подсистему визуализации</label
    >
    <select
      class="form__input-small"
      id="IntegrityGUARD"
      name="IntegrityGUARD аппаратная плата"
    >
      <option value="Нет">Нет</option>
      <option value="Да">Да</option>
    </select>
  </div>
</div>
</section>
`;
    attachEventHandlers(pollDiv);
    return pollDiv;
  }

  function updatePolls() {
    const count = parseInt(controlPointInput.value, 10);
    if (isNaN(count) || count < 1) {
      addedQuestsContainer.innerHTML = "";
      return;
    }
    addedQuestsContainer.innerHTML = "";
    for (let i = 0; i < count; i++) {
      const poll = createPoll(i);
      addedQuestsContainer.appendChild(poll);
    }

    // Добавляем эту строку
    attachEventHandlers();
  }

  controlPointInput.addEventListener("input", updatePolls);
}

// Функция для создания нового опроса

// function collectAllPollData() {
//   const allPollData = [];
//   const addedQuestsContainer = document.querySelector(".added-quests");

//   if (!addedQuestsContainer) return [];

//   addedQuestsContainer
//     .querySelectorAll(".poll-container")
//     .forEach((pollContainer, index) => {
//       const formData = {};

//       // === Сборка обычных данных из формы ===
//       pollContainer.querySelectorAll("input, select").forEach((input) => {
//         let value = "";
//         if (input.type === "checkbox") {
//           value = input.checked ? "Да" : "Нет";
//         } else if (input.tagName === "SELECT") {
//           value = input.value;
//         } else {
//           value = input.value || "Нет";
//         }

//         const label =
//           input
//             .closest(".form__question")
//             ?.querySelector(".form__input-name, .form__input-name-inside")
//             ?.innerText.trim() || input.name;
//         if (label) {
//           formData[label] = value;
//         }
//       });

//       // === Сборка программ обучения для текущей формы ===
//       const courseCheckboxes =
//         pollContainer.querySelectorAll(".course-checkbox");
//       const selectedCourses = [];

//       courseCheckboxes.forEach((checkbox) => {
//         if (checkbox.checked && checkbox.dataset.courseName) {
//           selectedCourses.push(checkbox.dataset.courseName);
//         }
//       });

//       if (selectedCourses.length > 0) {
//         formData["Программы обучения"] = selectedCourses.join(", ");
//       }

//       // Добавляем данные в массив
//       allPollData.push({
//         Опрос: `Конфигурация №${index + 1}`,
//         ...formData,
//       });
//     });

//   return allPollData;
// }
// Инициализация обработчика при загрузке документа
function normalizeQuestion(question) {
  // Удаляем переносы строк, лишние пробелы и кавычки
  let normalized = question
    .replace(/\s+/g, " ")
    .replace(/[\n\r]/g, "")
    .trim();

  // Опционально: убираем всё после точки или двоеточия (если есть длинное описание)
  normalized = normalized.split(".")[0].split(":")[0];

  return normalized.trim();
}
function setupDistributedSystemFormSubmission() {
  const distributedSection = document.querySelector("#questionnaire3");
  if (!distributedSection) return;

  const submitButton = distributedSection.querySelector(
    ".btn__questionnaire-send"
  );
  if (!submitButton) return;

  submitButton.addEventListener("click", function (event) {
    event.preventDefault(); // Предотвращаем стандартную отправку формы
    if (validateFormOneWithValidation() && validateInputFields()) {
      try {
        // Собираем данные из всех опросов распределенной системы
        const allPollData = collectDistributedSystemFormData();

        // Экспортируем данные в Excel
        exportDistributedSystemDataToExcel(allPollData);
      } catch (error) {
        console.error("Ошибка при обработке данных:", error);
        alert(
          "Произошла ошибка при обработке данных. Проверьте заполнение всех полей."
        );
      }
    }
  });
}
function collectDistributedSystemFormData() {
  const distributedSection = document.querySelector("#questionnaire3");
  if (!distributedSection) return {};

  // Сбор основных данных из формы распределенной системы
  const mainFormData = {};
  distributedSection
    .querySelectorAll(".form__q__hidden input, .form__q__hidden select")
    .forEach((input) => {
      let value = "";
      if (input.type === "checkbox") {
        value = input.checked ? "Да" : "Нет";
      } else if (input.tagName === "SELECT") {
        value = input.value;
      } else {
        value = input.value || "Нет";
      }

      const label =
        input
          .closest(".form__question")
          ?.querySelector(".form__input-name")
          ?.innerText.trim() || input.name;

      if (label) {
        mainFormData[label] = value;
      }
    });

  // Не меняем collectFormOneData(), просто достаём данные
  const formOneData = collectFormOneData(); // { "Данные заказчика": { ... } }
  const customerData = formOneData["Данные заказчика"] || {};

  // Сбор данных из всех опросов (.poll-container)
  const addedQuestsContainer =
    distributedSection.querySelector("#added__quests");
  if (!addedQuestsContainer) return { ...mainFormData, ...customerData };
  // Сбор программ обучения внутри этой формы
  // const courseCheckboxes = pollContainer.querySelectorAll(".course-checkbox");
  const selectedCourses = [];

  // courseCheckboxes.forEach((checkbox) => {
  //   if (checkbox.checked) {
  //     const courseName = checkbox.dataset.courseName;
  //     if (courseName) selectedCourses.push(courseName);
  //   }
  // });

  if (selectedCourses.length > 0) {
    formData["Программы обучения"] = selectedCourses.join(", ");
  }

  const allPollData = [];

  addedQuestsContainer
    .querySelectorAll(".poll-container")
    .forEach((pollContainer, index) => {
      const formData = {};
      pollContainer.querySelectorAll("input, select").forEach((input) => {
        let value = "";
        if (input.type === "checkbox") {
          value = input.checked ? "Да" : "Нет";
        } else if (input.tagName === "SELECT") {
          value = input.value;
        } else {
          value = input.value || "Нет";
        }

        const label =
          input
            .closest(".form__question")
            ?.querySelector(".form__input-name, .form__input-name-inside")
            ?.innerText.trim() || input.name;

        if (label) {
          formData[label] = value;
        }
      });

      // Добавляем данные из formOne как отдельные поля
      allPollData.push({
        ...customerData, // Теперь это: ФИО, Телефон и т.д.
        ...formData,
        Опрос: `Конфигурация №${index + 1}`,
        ...mainFormData,
      });
    });
  console.log(allPollData);
  return allPollData;
}
function collectFormOneData() {
  const form = document.querySelector("#formOne");
  if (!form) return {};

  const formData = {};
  form.querySelectorAll("input, select, textarea").forEach((input) => {
    let value;
    if (input.type === "checkbox") {
      value = input.checked ? "Да" : "Нет";
    } else if (input.type === "radio") {
      if (!input.checked) return;
      value = input.value;
    } else {
      value = input.value || ""; // ← Изменили здесь
    }
    const label =
      input
        .closest(".form__question")
        ?.querySelector(".form__input-name, .form__input-name-inside")
        ?.innerText.trim() || input.name;

    formData[label] = value;
  });
  console.log(formData);
  return { "Данные заказчика": formData };
}
function collectConfigFormsData() {
  const allForms = document.querySelectorAll(
    "#questionnaire1 .form__questionnaireTwo"
  );
  const allData = {};

  allForms.forEach((form, index) => {
    const formData = {};

    // === Сборка программ обучения ===
    const courseCheckboxes = form.querySelectorAll(".course-checkbox");
    const selectedCourses = [];

    courseCheckboxes.forEach((checkbox) => {
      if (checkbox.checked && checkbox.dataset.courseName) {
        selectedCourses.push(checkbox.dataset.courseName);
      }
    });

    if (selectedCourses.length > 0) {
      formData["Программы обучения"] = selectedCourses.join(", ");
    } else {
      formData["Программы обучения"] = "Нет";
    }

    // === Сборка остальных данных из формы ===
    form.querySelectorAll("input, select").forEach((input) => {
      let value;

      if (input.type === "checkbox") {
        if (input.classList.contains("course-checkbox")) {
          // Уже обработано выше — пропускаем
          return;
        }
        value = input.checked ? "Да" : "Нет";
      } else if (input.tagName === "SELECT" || input.type === "radio") {
        if (input.type === "radio" && !input.checked) return;
        value = input.value;
      } else {
        value = input.value || "Нет";
      }

      const label =
        input
          .closest(".form__question")
          ?.querySelector(".form__input-name, .form__input-name-inside")
          ?.innerText.trim() || input.name;

      if (label) {
        formData[label] = value;
      }
    });

    allData[`Конфигурация ${index + 1}`] = formData;
  });

  console.log("Собранные данные:", allData); // Для проверки
  return allData;
}
function collectAllFormDataWithFormOne() {
  const mainData = collectFormOneData(); // { "Основная форма": { ... } }
  const configData = collectConfigFormsData(); // { "Конфигурация 1": { ... }, ... }

  return {
    ...mainData,
    ...configData,
  };
}

// Функция для экспорта данных в Excel
async function exportToExcel(data) {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("Ответы");

  // === Стили для заголовков ===
  const headerStyle = {
    font: {
      bold: true,
      size: 12,
      color: { argb: "000000" }, // белый цвет
    },
    fill: {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF1E90FF" }, // синий фон
    },
    alignment: {
      vertical: "middle",
      horizontal: "center",
    },
    border: {
      top: { style: "thin" },
      left: { style: "thin" },
      bottom: { style: "thin" },
      right: { style: "thin" },
    },
  };

  // === Стили для содержимого ===
  const cellStyle = {
    font: {
      size: 11,
      color: { argb: "00000000" }, // черный текст
    },
    alignment: {
      wrapText: true,
      vertical: "top",
    },
    border: {
      top: { style: "thin" },
      left: { style: "thin" },
      bottom: { style: "thin" },
      right: { style: "thin" },
    },
  };

  // === Добавляем заголовки ===
  const headers = ["Вопрос", "Ответ"];
  const headerRow = worksheet.addRow(headers);
  headerRow.eachCell((cell) => {
    cell.style = headerStyle;
  });

  // === Добавляем данные ===
  for (const [question, answer] of Object.entries(data)) {
    const row = worksheet.addRow([question, answer]);
    row.eachCell((cell) => {
      cell.style = cellStyle;
    });
  }

  // === Автоподбор ширины столбцов ===
  worksheet.columns.forEach((column) => {
    let maxLength = 0;
    column.eachCell({ includeEmpty: true }, (cell) => {
      const columnLength = cell.value ? cell.value.toString().length : 10;
      if (columnLength > maxLength) maxLength = columnLength;
    });
    column.width = maxLength < 15 ? 15 : maxLength > 50 ? 50 : maxLength;
  });

  // === Сохранение файла ===
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  // saveWorkbook(blob, "Опросный_лист.xlsx");

  // === Отправка файла ===
  await sendFileViaPHP(blob, "Опросный_лист.xlsx");
}
async function exportDistributedSystemDataToExcel(data) {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("Ответы_распределенная_система");

  // === Стили для заголовков ===
  const headerStyle = {
    font: { bold: true, size: 12, color: { argb: "000000" } }, // белый текст
    fill: { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E90FF" } }, // синий фон
    alignment: { vertical: "middle", horizontal: "center" },
    border: {
      top: { style: "thin", color: { argb: "00000000" } },
      left: { style: "thin", color: { argb: "00000000" } },
      bottom: { style: "thin", color: { argb: "00000000" } },
      right: { style: "thin", color: { argb: "00000000" } },
    },
  };

  // === Стили для содержимого ===
  const cellStyle = {
    font: { size: 11, color: { argb: "00000000" } }, // черный текст
    alignment: { wrapText: true, vertical: "top" },
    border: {
      top: { style: "thin", color: { argb: "00000000" } },
      left: { style: "thin", color: { argb: "00000000" } },
      bottom: { style: "thin", color: { argb: "00000000" } },
      right: { style: "thin", color: { argb: "00000000" } },
    },
  };

  // === Собираем вопросы в порядке их появления в первом опросе ===
  const firstPoll = data[0];
  const questionsInOrder = [];
  for (const question in firstPoll) {
    questionsInOrder.push(question);
  }

  // Добавляем заголовки как столбцы (Опрос №1, Опрос №2 и т.д.)
  const headerRow = ["Вопрос", ...data.map((d) => d["Опрос"])];
  const headerCells = worksheet.addRow(headerRow);

  // Применяем стиль к заголовкам
  headerCells.eachCell((cell) => {
    cell.style = headerStyle;
  });

  // Для каждого вопроса в порядке формы добавляем строку
  questionsInOrder.forEach((question) => {
    const row = [question]; // Вопрос в первом столбце
    data.forEach((formData) => {
      row.push(formData[question] || ""); // Ответы по столбцам
    });

    // Добавляем строку в таблицу
    const excelRow = worksheet.addRow(row);

    // Применяем стиль к ячейкам строки
    excelRow.eachCell((cell) => {
      cell.style = cellStyle;
    });
  });

  // === Автоподбор ширины столбцов ===
  worksheet.columns.forEach((column) => {
    let maxLength = 0;
    column.eachCell({ includeEmpty: true }, (cell) => {
      const columnLength = cell.value ? cell.value.toString().length : 10;
      if (columnLength > maxLength) maxLength = columnLength;
    });
    column.width = maxLength < 15 ? 15 : maxLength > 50 ? 50 : maxLength;
  });

  // === Сохранение файла ===
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  // saveWorkbook(blob, "Опросный_лист.xlsx");

  // === Отправка файла ===
  await sendFileViaPHP(blob, "Опросный_лист.xlsx");
}
async function exportAllToExcel(allData) {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("Опрос");

  // Стили
  const headerStyle = {
    font: { bold: true, size: 12, color: { argb: "FFFFFFFF" } },
    fill: { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E90FF" } },
    alignment: { vertical: "middle", horizontal: "center", wrapText: true },
    border: {
      top: { style: "thin" },
      left: { style: "thin" },
      bottom: { style: "thin" },
      right: { style: "thin" },
    },
  };

  const cellStyle = {
    font: { size: 11 },
    alignment: { wrapText: true, vertical: "top" },
    border: {
      top: { style: "thin" },
      left: { style: "thin" },
      bottom: { style: "thin" },
      right: { style: "thin" },
    },
  };

  // === Шаг 1: Собираем все уникальные вопросы в порядке первого появления ===
  const questionMap = new Map(); // { cleanQuestion => originalQuestion }

  Object.values(allData).forEach((formData) => {
    Object.keys(formData).forEach((originalQuestion) => {
      const cleanQuestion = normalizeQuestion(originalQuestion);
      if (!questionMap.has(cleanQuestion)) {
        questionMap.set(cleanQuestion, originalQuestion);
      }
    });
  });

  const questionOrder = Array.from(questionMap.keys());
  const originalQuestions = Array.from(questionMap.values());

  // === Шаг 2: Перемещаем "Программы обучения" в конец ===
  const PROGRAM_QUESTION_CLEAN = "Программы обучения";
  const PROGRAM_QUESTION_ORIGINAL = questionMap.get(PROGRAM_QUESTION_CLEAN);

  // Удаляем из текущего места
  const programIndex = questionOrder.indexOf(PROGRAM_QUESTION_CLEAN);
  if (programIndex !== -1) {
    questionOrder.splice(programIndex, 1);
    originalQuestions.splice(programIndex, 1);
  }

  // Добавляем в конец
  questionOrder.push(PROGRAM_QUESTION_CLEAN);
  originalQuestions.push(PROGRAM_QUESTION_ORIGINAL);

  // === Шаг 3: Формируем заголовки ===
  const headers = ["Вопрос", ...Object.keys(allData)];
  const headerRow = worksheet.addRow(headers);
  headerRow.eachCell((cell) => (cell.style = headerStyle));

  // === Шаг 4: Заполняем строки данными ===
  originalQuestions.forEach((originalQuestion, i) => {
    const cleanQuestion = questionOrder[i];
    const row = [cleanQuestion];

    Object.values(allData).forEach((formData) => {
      row.push(formData[originalQuestion] || "");
    });

    worksheet.addRow(row);
  });
  // Автоподбор ширины столбцов
  worksheet.columns.forEach((column) => {
    let maxLength = 0;
    column.eachCell({ includeEmpty: true }, (cell) => {
      const length = cell.value ? cell.value.toString().length : 10;
      if (length > maxLength) maxLength = length;
    });
    column.width = maxLength < 15 ? 15 : maxLength > 50 ? 50 : maxLength;
  });

  // Сохранение файла
  try {
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });

    // === СКАЧИВАНИЕ НА КЛИЕНТЕ ===
    // saveWorkbook(blob, "Опросный_лист.xlsx");

    // === Отправка файла ===
    await sendFileViaPHP(blob, "Опросный_лист.xlsx");
  } catch (error) {
    console.error("Ошибка при записи Excel:", error);
    alert("Произошла ошибка при экспорте.");
    return false;
  }
}
// отправка файла
async function sendFileViaPHP(blob, filename) {
  try {
    const file = new File([blob], filename, {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });

    const formOne = document.getElementById("formOne");

    const fio =
      formOne.querySelector("[name='Фамилия_Имя_Отчество']")?.value.trim() ||
      "Нет";
    const org =
      formOne.querySelector("[name='Организация']")?.value.trim() || "Нет";
    const phone =
      formOne.querySelector("[name='Телефон']")?.value.trim() || "Нет";
    const email =
      formOne.querySelector("[name='Почта']")?.value.trim() || "Нет";
    const customer =
      formOne.querySelector("[name='Конечный_заказчик']")?.value.trim() ||
      "Нет";
    const object =
      formOne.querySelector("[name='Объект']")?.value.trim() || "Нет";

    const formData = new FormData();
    formData.append("file", file);
    formData.append("fio", fio);
    formData.append("organization", org);
    formData.append("phone", phone);
    formData.append("email", email);
    formData.append("customer", customer);
    formData.append("object", object);

    const response = await fetch("../php3.php", {
      method: "POST",
      body: formData,
    });

    let result;
    try {
      // ← Единственный раз читаем тело как JSON
      result = await response.json();
    } catch (e) {
      // ← Если JSON не удался, читаем как текст ОДИН РАЗ
      const text = await response.text(); // ✅ первый и единственный раз
      try {
        result = JSON.parse(text);
      } catch {
        console.error("Не удалось распарсить JSON:", text);
        alert("Ошибка: неверный формат ответа сервера");
        return;
      }
    }

    alert(result.message || "Файл успешно отправлен");
  } catch (error) {
    console.error("Ошибка при отправке файла:", error);
    alert("Произошла ошибка при отправке файла.");
  }
}

function saveWorkbook(blob, filename) {
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href); // Освобождаем память
}
