document.addEventListener('DOMContentLoaded', () => {
  const registerForm = document.getElementById('registerForm');
  const messageBox = document.getElementById('message'); // Div to show success/error
  const submitButton = registerForm.querySelector('.btn__product-submit');
  const btnText = submitButton.querySelector('.btn-text');
  const btnLoader = submitButton.querySelector('.btn-loader');

  // Optional: Password Strength Indicator Logic (Example)
  const passwordInput = document.getElementById('password');
  const strengthBar = document.querySelector('.strength-bar');
  const strengthText = document.querySelector('.strength-text');

  if (passwordInput && strengthBar && strengthText) {
      passwordInput.addEventListener('input', () => {
          const password = passwordInput.value;
          let strength = 0;
          let text = 'Слабый';
          let barClass = 'weak';

          if (password.length >= 6) strength++;
          if (password.length >= 8) strength++;
          if (/[A-Z]/.test(password)) strength++;
          if (/[0-9]/.test(password)) strength++;
          if (/[^A-Za-z0-9]/.test(password)) strength++; // Special char

          const percentage = (strength / 5) * 100;
          strengthBar.style.width = `${percentage}%`;

          if (strength <= 1) { text = 'Слабый'; barClass = 'weak'; }
          else if (strength <= 3) { text = 'Средний'; barClass = 'medium'; }
          else { text = 'Сильный'; barClass = 'strong'; }

          strengthBar.className = `strength-bar ${barClass}`; 
          strengthText.textContent = text;
      });
  }


  if (registerForm) {
      registerForm.addEventListener('submit', async (event) => {
          event.preventDefault(); // Prevent default form submission

          // Show loader, hide text
          btnText.style.display = 'none';
          btnLoader.classList.remove('hidden');
          submitButton.disabled = true;
          messageBox.textContent = ''; // Clear previous messages
          messageBox.className = 'message-box'; // Reset class

          // --- Collect Form Data ---
          const formData = {
              email: document.getElementById('email').value,
              fio: document.getElementById('fio').value,
              password_hash: document.getElementById('password').value,
              position: document.getElementById('position').value,
              company: document.getElementById('company').value,
              activity: document.getElementById('activitySphere').value,
              city: document.getElementById('city').value,
              phone: document.getElementById('phone').value,
          };

          // --- Send Data to Backend ---
          try {
              const response = await fetch('https://scadaint.ru/api/register', { // URL of your backend endpoint
                  method: 'POST',
                  headers: {
                      'Content-Type': 'application/json', // Tell the server we're sending JSON
                  },
                  body: JSON.stringify(formData), // Convert JS object to JSON string
              });

              const result = await response.json(); // Parse the JSON response from the server

              if (response.ok) { // Status code 200-299
                  messageBox.textContent = result.message || 'Регистрация прошла успешно!';
                  messageBox.classList.add('success');
                  registerForm.reset(); // Clear the form on success
                  // Optionally redirect or perform other actions
              } else {
                  // Handle errors (4xx, 5xx)
                  messageBox.textContent = result.message || 'Произошла ошибка при регистрации.';
                  messageBox.classList.add('error');
              }

          } catch (error) {
              // Handle network errors or issues reaching the server
              console.error('Registration fetch error:', error);
              messageBox.textContent = 'Не удалось связаться с сервером. Попробуйте позже.';
              messageBox.classList.add('error');
          } finally {
              // Hide loader, show text
              btnText.style.display = 'inline';
              btnLoader.classList.add('hidden');
              submitButton.disabled = false;
          }
      });
  } else {
      console.error("Register form not found");
  }
});
