/* =================================
   NOVATECH CHAT
================================= */

const chatForm =
    document.getElementById("chatForm");

const chatInput =
    document.getElementById("chatInput");

const chatMessages =
    document.getElementById("chatMessages");


if (chatForm) {

    chatForm.addEventListener(
        "submit",
        function (event) {

            event.preventDefault();


            const message =
                chatInput.value.trim();


            if (!message) {
                return;
            }


            const messageBox =
                document.createElement("div");

            messageBox.className =
                "chat-message customer";


            const text =
                document.createElement("p");

            text.textContent =
                message;


            messageBox.appendChild(text);

            chatMessages.appendChild(
                messageBox
            );


            chatInput.value = "";


            chatMessages.scrollTop =
                chatMessages.scrollHeight;


            /* TEMPORARY FRONTEND REPLY */

            setTimeout(function () {

                const reply =
                    document.createElement("div");

                reply.className =
                    "chat-message support";


                reply.innerHTML = `
                    <p>
                        Thanks for contacting NovaTech.
                        Our support team will respond to you.
                    </p>
                `;


                chatMessages.appendChild(reply);


                chatMessages.scrollTop =
                    chatMessages.scrollHeight;

            }, 700);

        }
    );

}