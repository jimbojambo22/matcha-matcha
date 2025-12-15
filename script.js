const deck = [
    { suit: "Leaf", number: 1 }, { suit: "Leaf", number: 2 }, { suit: "Leaf", number: 3 },
    { suit: "Leaf", number: 4 }, { suit: "Leaf", number: 5 }, { suit: "Leaf", number: 6 },
    { suit: "Leaf", number: 7 }, { suit: "Leaf", number: 8 },

    { suit: "Cup", number: 1 }, { suit: "Cup", number: 2 }, { suit: "Cup", number: 3 },
    { suit: "Cup", number: 4 }, { suit: "Cup", number: 5 }, { suit: "Cup", number: 6 },
    { suit: "Cup", number: 7 }, { suit: "Cup", number: 8 },

    { suit: "Whisk", number: 1 }, { suit: "Whisk", number: 2 }, { suit: "Whisk", number: 3 },
    { suit: "Whisk", number: 4 }, { suit: "Whisk", number: 5 }, { suit: "Whisk", number: 6 },
    { suit: "Whisk", number: 7 }, { suit: "Whisk", number: 8 },

    { suit: "Teapot", number: 1 }, { suit: "Teapot", number: 2 }, { suit: "Teapot", number: 3 },
    { suit: "Teapot", number: 4 }, { suit: "Teapot", number: 5 }, { suit: "Teapot", number: 6 },
    { suit: "Teapot", number: 7 }, { suit: "Teapot", number: 8 },

    { suit: "Blossom", number: 1 }, { suit: "Blossom", number: 2 }, { suit: "Blossom", number: 3 },
    { suit: "Blossom", number: 4 }, { suit: "Blossom", number: 5 }, { suit: "Blossom", number: 6 },
    { suit: "Blossom", number: 7 }, { suit: "Blossom", number: 8 },

    // Two-suit cards
    { suit: "Leaf", number: "Cup" },
    { suit: "Cup", number: "Whisk" },
    { suit: "Whisk", number: "Teapot" },
    { suit: "Teapot", number: "Blossom" },
    { suit: "Blossom", number: "Leaf" },

    // Two-number cards
    { suit: 1, number: 2 },
    { suit: 3, number: 4 },
    { suit: 5, number: 6 },
    { suit: 7, number: 8 },

    //Special Cards
    //{ type: "special", name: "Last Sip"},
    //{ type: "special", name: "Free Space"},
    //{ type: "special", name: "Free Space"}
];
// 
let drawPile = [...deck];
let tableCards = [];
let canGuess = true;

let numPlayers = 1;
let playerScores = [];
let currentPlayer = 0;

let scoringMode = "free";
let availableScoreTokens = [];
let playerTokens = [];

let playerStacks = [];
let isSteepStart = [];
let forcedBank = false;

let currentRound = 1;
let turnDirection = 1; //1 is clockwise, -1 is counter

let hasGuessedThisTurn = false;

const matchButton = document.getElementById("matchButton");
const noMatchButton = document.getElementById("noMatchButton");
const display = document.getElementById("cardDisplay");
const tableDisplay = document.getElementById("tableDisplay");
const scoreDisplay = document.getElementById("scoreDisplay");
const bankButton = document.getElementById("bankButton");
const resultDisplay = document.getElementById("resultDisplay");
const nextTurnButton = document.getElementById("nextTurnButton");
const newGameButton = document.getElementById("newGameButton");
const playerCountSelect = document.getElementById("playerCount");
const playerDisplay = document.getElementById("playerDisplay");
const scoreboard = document.getElementById("scoreboard");
const steepButton = document.getElementById("steepButton");

// -------------------------------
// Helpers for two-suit / two-number cards
// -------------------------------
function getCardSuits(card) {
    if (card.type === "special") return[]; //no suit
    const suits = [];
    if (typeof card.suit === "string") suits.push(card.suit);
    if (typeof card.number === "string") suits.push(card.number);
    return suits;
}

function getCardNumbers(card) {
    if (card.type === "special") return []; //no numbers
    const nums = [];
    if (typeof card.number === "number") nums.push(card.number);
    if (typeof card.suit === "number") nums.push(card.suit);
    return nums;
}

// -------------------------------
// Button enabling/disabling
// -------------------------------
function disableGuessing() {
    canGuess = false;
    matchButton.disabled = true;
    noMatchButton.disabled = true;
    bankButton.disabled = true;
    steepButton.disabled = true;
}

function enableGuessing() {
    canGuess = true;
    matchButton.disabled = false;
    noMatchButton.disabled = false;
    bankButton.disabled = false;
    steepButton.disabled = false;
}

function updateRoundIndicator() {
    const elem = document.getElementById("roundIndicator");
    elem.textContent = "Round " + currentRound + " of 2";
}
function showRoundPopup(message) {
    const popup = document.getElementById("roundPopup");
    const content = document.getElementById("roundPopupContent");

    content.textContent = message;
    popup.classList.add("show");

    setTimeout(() => {
        popup.classList.remove("show");
    }, 2500);
}
function createCardElement(card) {
    const div = document.createElement("div");
    div.classList.add("card");

    // -----------------------------
    // SPECIAL CARDS
    // -----------------------------
    if (card.type === "special") {
        div.classList.add("specialCard");
        div.textContent = card.name;
        return div;
    }

    // -----------------------------
    // GATHER SUIT AND NUMBER VALUES
    // -----------------------------
    let suits = [];
    let numbers = [];

    if (typeof card.suit === "string") suits.push(card.suit);
    if (typeof card.number === "string") suits.push(card.number);

    if (typeof card.number === "number") numbers.push(card.number);
    if (typeof card.suit === "number") numbers.push(card.suit);

    // Set suit color from FIRST suit (dominant suit)
    if (suits.length > 0) {
        const mainSuit = suits[0].toLowerCase();
        div.classList.add("suit-" + mainSuit);
    }

    // -----------------------------
    // TOP CORNER (number or suit)
    // -----------------------------
    if (numbers.length > 0) {
        const topNum = document.createElement("div");
        topNum.classList.add("card-corner", "top");
        topNum.textContent = numbers[0];
        div.appendChild(topNum);
    } else if (suits.length > 0) {
        const topSuit = document.createElement("img");
        topSuit.classList.add("card-corner", "top", "card-suit-small");
        topSuit.src = suits[0].toLowerCase() + ".svg";
        topSuit.alt = suits[0];
        div.appendChild(topSuit);
    }

    // -----------------------------
    // BOTTOM CORNER (second number or second suit)
    // -----------------------------
    if (numbers.length > 1) {
        const bottomNum = document.createElement("div");
        bottomNum.classList.add("card-corner", "bottom");
        bottomNum.textContent = numbers[1];
        div.appendChild(bottomNum);
    } else if (suits.length > 1) {
        const bottomSuit = document.createElement("img");
        bottomSuit.classList.add("card-corner", "bottom", "card-suit-small");
        bottomSuit.src = suits[1].toLowerCase() + ".svg";
        bottomSuit.alt = suits[1];
        div.appendChild(bottomSuit);
    }

    // -----------------------------
    // CENTER SUIT IMAGE (dominant suit only)
    // -----------------------------
    // CENTER SUIT ICON (ONLY if exactly ONE suit exists)
    if (suits.length === 1) {
        const centerSuit = document.createElement("img");
        centerSuit.classList.add("card-suit");
        centerSuit.src = suits[0].toLowerCase() + ".svg";
        centerSuit.alt = suits[0];
        div.appendChild(centerSuit);
    }

    return div;
}


// -------------------------------
// Scoreboard
// -------------------------------
// function updateScoreboard() {
//     const panels = document.getElementById("playerPanels");
//     panels.innerHTML = "";                      // clear old layout

//     for (let i = 0; i < numPlayers; i++) {
//         let panel = document.createElement("div");      // create panel
//         panel.classList.add("playerPanel");
//         if (i === currentPlayer) panel.classList.add("active");     //highlight current player
//         let name = document.createElement("div");                       //player  name
//         name.classList.add("playerName");
//         name.textContent = "Player " + (i + 1);
//         panel.appendChild(name);

//         //player score
//         let score = document.createElement("div");
//         score.classList.add("playerScore");
//         score.textContent = "Score: " + playerScores[i];
//         panel.appendChild(score);

//         //steeped pot
//         /*let potDiv = document.createElement("div");
//         potDiv.classList.add("playerPot");
//         let pot = playerStacks[i];
//         if (pot.top) {
//             // Render the steeped pot card using the same graphics as table cards
//             let topCardElem = createCardElement(pot.top);
//             topCardElem.classList.add("playerPotCardGraphic"); // optional custom scaling
//             potDiv.appendChild(topCardElem);

//             let countDiv = document.createElement("div");
//             countDiv.classList.add("playerPotCount");
//             countDiv.textContent = "+" + pot.hidden.length;
//             potDiv.appendChild(countDiv);
//         } else {
//             potDiv.textContent = "";
//         }
//         panel.appendChild(potDiv);*/
//         let potWrapper = document.createElement("div");
//         potWrapper.classList.add("playerPotWrapper");   // NEW CONTAINER

//         let pot = playerStacks[i];

//         if (pot.top) {
//             let topCardElem = createCardElement(pot.top);
//             topCardElem.classList.add("mini");

//             let countDiv = document.createElement("div");
//             countDiv.classList.add("playerPotCount");
//             countDiv.textContent = "+" + pot.hidden.length;

//             potWrapper.appendChild(topCardElem);
//             potWrapper.appendChild(countDiv);
//         } else {
//             // Maintain consistent spacing when empty
//             potWrapper.innerHTML = `<div class="playerPotPlaceholder"></div>`;
//         }

//         panel.appendChild(potWrapper);

//         //Player score tokens
//         let tokenDiv = document.createElement("div");
//         tokenDiv.classList.add("playerTokens");

//         if (scoringMode === "tokens" || scoringMode === "trade") {
//             playerTokens[i].forEach(val => {
//                 let t = document.createElement("div");
//                 t.classList.add("playerToken");
//                 t.textContent = val;
//                 tokenDiv.appendChild(t);
//             });
//         }
        
//         panel.appendChild(tokenDiv);
//         panels.appendChild(panel);              // add panel to container
//     }
// }
function updateScoreboard() {
    const panels = document.getElementById("playerPanels");
    panels.innerHTML = "";  // Clear old layout

    for (let i = 0; i < numPlayers; i++) {

        // PANEL
        let panel = document.createElement("div");
        panel.classList.add("playerPanel");
        if (i === currentPlayer) panel.classList.add("active");

        // PLAYER NAME
        let name = document.createElement("div");
        name.classList.add("playerName");
        name.textContent = "Player " + (i + 1);
        panel.appendChild(name);

        // SCORE
        let score = document.createElement("div");
        score.classList.add("playerScore");
        score.textContent = "Score: " + playerScores[i];
        panel.appendChild(score);

        // SCORE TOKENS (ALWAYS under Score)
        let tokenDiv = document.createElement("div");
        tokenDiv.classList.add("playerTokens");

        if (scoringMode === "tokens" || scoringMode === "trade") {
            playerTokens[i].forEach(val => {
                let t = document.createElement("div");
                t.classList.add("playerToken");
                t.textContent = val;
                tokenDiv.appendChild(t);
            });
        }

        panel.appendChild(tokenDiv);   // IMPORTANT: tokens go here ALWAYS

        // STEEPED POT (always appears AFTER tokens)
        let potWrapper = document.createElement("div");
        potWrapper.classList.add("playerPotWrapper");

        let pot = playerStacks[i];

        if (pot.top) {
            // Create mini card
            let topCardElem = createCardElement(pot.top);
            topCardElem.classList.add("mini");

            // Count of steeped cards
            let countDiv = document.createElement("div");
            countDiv.classList.add("playerPotCount");
            countDiv.textContent = "+" + pot.hidden.length;

            potWrapper.appendChild(topCardElem);
            potWrapper.appendChild(countDiv);

        } else {
            // Invisible placeholder keeps panels aligned
            let placeholder = document.createElement("div");
            placeholder.classList.add("card", "mini", "playerPotPlaceholder");
            potWrapper.appendChild(placeholder);
        }

        panel.appendChild(potWrapper);

        // ADD PANEL TO SCOREBOARD
        panels.appendChild(panel);
    }
}

//---------------
// move cards
//------------
function moveRevealedToTable() {
    const reveal = document.getElementById("revealCard");
    const card = reveal.querySelector(".card");

    if (!card) return; // nothing to move

    // Add slide animation class
    card.classList.add("slide");

    // After animation ends, move card to the table
    card.addEventListener("animationend", () => {
        // Remove the slide class so it looks normal on the table
        card.classList.remove("slide");
        card.classList.remove("flip");

        // Move the same element to the table area
        document.getElementById("tableCards").appendChild(card);

        // Clear the reveal area
        reveal.innerHTML = "";
    }, { once: true });
}

// -------------------------------
// New Game
// -------------------------------
function startNewGame() {
    hasGuessedThisTurn = false;
    numPlayers = parseInt(playerCountSelect.value);
    playerScores = new Array(numPlayers).fill(0);
    currentPlayer = 0;

    scoringMode = document.getElementById("scoringMode").value;
    //reset score cards if using limited scoring
    if (scoringMode === "tokens" || scoringMode === "trade") {
        availableScoreTokens = [1,2,3,4,5,6,7,8];
    } else {
        availableScoreTokens = [];
    }
    playerTokens = new Array(numPlayers).fill(null).map(() => []);
    updateScoreTokenDisplay();

    tableCards = [];
    drawPile = [...deck];

    resultDisplay.textContent = [];

    document.getElementById("tableCards").innerHTML = "";
    document.getElementById("revealCard").innerHTML = "";

    playerDisplay.textContent = "Current Player: " + (currentPlayer + 1);
    //scoreDisplay.textContent = "Score: " + playerScores[currentPlayer];

    playerStacks = new Array(numPlayers).fill(null).map(() => ({
        hidden: [],
        top: null
    }));
    isSteepStart = new Array(numPlayers).fill(false);

    currentRound = 1;
    turnDirection = 1;
    updateRoundIndicator();

    enableGuessing();
    updateScoreboard();
    dealFirstCard();
}

// -------------------------------
// Deal first card
// -------------------------------
function dealFirstCard() {
    hasGuessedThisTurn = false;
    if (drawPile.length === 0) drawPile = [...deck];

    let index = Math.floor(Math.random() * drawPile.length);
    let firstCard = drawPile[index];
    drawPile.splice(index, 1);

    tableCards = [firstCard];

    //tableDisplay.textContent = firstCard.suit + " " + firstCard.number;          // old display
    //display.textContent = firstCard.suit + " " + firstCard.number;
    // New reveal card area
    /*document.getElementById("revealCard").innerHTML =                         // don't show first card in Reveal Card spot
    `<div class="card">${firstCard.suit} ${firstCard.number}</div>`;*/

    // New table area
    //document.getElementById("tableCards").innerHTML =
    //`<div class="card">${firstCard.suit} ${firstCard.number}</div>`;
    const table = document.getElementById("tableCards");
    table.innerHTML = "";

    const cardElem = createCardElement(firstCard);
    table.appendChild(cardElem);

    updateDeckVisual();
}

//---------------
// Score Token Display
//---------------
function updateScoreTokenDisplay() {
    const box = document.getElementById("scoreTokenDisplay");

    if (scoringMode === "free") {
        box.innerHTML = "";
        return;
    }
    box.innerHTML = "";

    availableScoreTokens.forEach(value => {
        let token = document.createElement("div");
        token.classList.add("scoreToken");
        token.textContent = value;
        box.appendChild(token);
    });
}

//---------------------
//Show Results in popup
//------------------------
function showResult(msg) {
    const box = document.getElementById("resultPopup");
    box.textContent = msg;
    box.classList.add("show");

    setTimeout(() => {                              //hide after 2 seconds
        box.classList.remove('show');
    }, 2000);
};

//card reveal animation
/*function showRevealedCard(card) {
    const reveal = document.getElementById("revealCard");

    if (card.type === "special") {
        reveal.innerHTML = `<div class="card flip specialCard">${card.name}</div>`;
    } else {
        reveal.innerHTML = `<div class="card flip">${card.suit} ${card.number}</div>`;
    }
}*/
function showRevealedCard(card) {
    const reveal = document.getElementById("revealCard");
    reveal.innerHTML = "";

    const cardElem = createCardElement(card);
    cardElem.classList.add("flip");

    reveal.appendChild(cardElem);
}

// -------------------------------
// Draw card and apply rules
// -------------------------------
function drawCard(playerGuess) {
    if (!canGuess) return;
    //hasGuessedThisTurn = true;

    if (drawPile.length === 0) drawPile = [...deck];

    let index = Math.floor(Math.random() * drawPile.length);
    let drawnCard = drawPile[index];
    drawPile.splice(index, 1);

    showRevealedCard(drawnCard);

    if (drawnCard.type === "special" && drawnCard.name ==="Last Sip") {
        showResult("Last Sip! Your turn is over.");

        tableCards.push(drawnCard);

        setTimeout(() => {
            moveRevealedToTable();
        }, 100);

        disableGuessing();

        setTimeout(() => {                              //simulates pressing Bank button
            forcedBank = true;
            bankButton.click();
        }, 700);

        return;
    }

    hasGuessedThisTurn = true;

    const drawnSuits = getCardSuits(drawnCard);
    const drawnNumbers = getCardNumbers(drawnCard);

    let suitMatches = tableCards.some(card =>
        getCardSuits(card).some(s => drawnSuits.includes(s))
    );

    let numberMatches = tableCards.some(card =>
        getCardNumbers(card).some(n => drawnNumbers.includes(n))
    );

    let actualResult =
        suitMatches && numberMatches ? "matcha" :
        suitMatches || numberMatches ? "match" :
        "nomatch";

    // Apply rules
   /* APPLY RULES */
if (playerGuess === "match") {

    if (actualResult === "match") {
        // Correct guess
        tableCards.push(drawnCard);
        showResult("Correct! It's a MATCH!");
        // Move card to table after 2 seconds
        setTimeout(() => {
            moveRevealedToTable();
        }, 1500);
    }
    else if (actualResult === "matcha") {
        // Matcha Matcha = instant loss
        showResult("Matcha Matcha! You Lose!");
        disableGuessing();
        playerStacks[currentPlayer] = { hidden: [], top: null };
    }
    else {
        // Wrong guess
        showResult("Wrong! No Match!");
        disableGuessing();
        playerStacks[currentPlayer] = { hidden: [], top: null };
    }

}
else if (playerGuess === "nomatch") {

    if (actualResult === "nomatch") {
        // Correct guess
        tableCards.push(drawnCard);
        showResult("Correct! No Match!");
        // Move card to table after 2 seconds
        setTimeout(() => {
            moveRevealedToTable();
        }, 1500);
    }
    else if (actualResult === "matcha") {
        // Matcha Matcha = instant loss
        showResult("Matcha Matcha! You Lose!");
        disableGuessing();
        playerStacks[currentPlayer] = { hidden: [], top: null };
    }
    else {
        // Wrong guess
        showResult("Wrong! That was a match!");
        disableGuessing();
        playerStacks[currentPlayer] = { hidden: [], top: null };
    }
}
    updateDeckVisual();
    /* Update table
    document.getElementById("tableCards").innerHTML = "";
    for (let c of tableCards) {
        document.getElementById("tableCards").innerHTML += `<div class="card">${c.suit} ${c.number}</div>`;
    }*/
}

//----------------------
//End of turn Token Trade-In
//-------------------------
function handleTradeIn(playerIndex) {
    if (scoringMode !== "trade") return;

    let tokens = playerTokens[playerIndex];
    if (tokens.length < 2) return;

    let sum = tokens.reduce((a, b) => a + b, 0);

    // Only trade if the resulting token is available
    if (!availableScoreTokens.includes(sum)) return;

    const tradedTokens = [...tokens];  // copy original

    // STEP 1: Animate old tokens flying out
    animatePlayerTokensOut(playerIndex, tradedTokens, () => {

        // STEP 2: Remove old tokens and return them to the pool
        tokens.forEach(t => {
            if (!availableScoreTokens.includes(t)) {
                availableScoreTokens.push(t);
            }
        });

        availableScoreTokens.sort((a, b) => a - b);

        // Clear player's tokens
        playerTokens[playerIndex] = [];

        // STEP 3: Animate the new combined token into the player
        animateTokenToPlayer(sum, playerIndex);

        // Delay actual token assignment to sync with animation
        setTimeout(() => {
            availableScoreTokens = availableScoreTokens.filter(x => x !== sum);
            playerTokens[playerIndex].push(sum);

            updateScoreTokenDisplay();
            updateScoreboard();

        }, 650);
    });
}

//-------------------------------
// Check if deck is almost empty (game over)
//------------------------------------
function checkRoundEnd() {
    if (drawPile.length < 5) {
   // resultDisplay.textContent = "GAME OVER! Reshuffle and play again! MATCHA MATCHA FOREVERRRRRR!!!!";
    //disableGuessing();
    //nextTurnButton.disabled = true;

    return true; //game ended
}
    return false; //game continues
};

//-------------------
//Start next round
//-----------------
function startNextRound() {
    if (currentRound === 1) {
        currentRound = 2;
        turnDirection = -1;
        drawPile = [...deck];
        tableCards = [];
        document.getElementById("tableCards").innerHTML = "";
        document.getElementById("revealCard").innerHTML = "";

        updateRoundIndicator();
        updateDeckVisual();
        
        showRoundPopup("Round 2 Begins! Direction reverses")

        //nextTurnButton.click();

        dealFirstCard();
    } else {
        showRoundPopup("GAME OVER! Reshuffle and play again! MATCHA MATCHA FOREVERRRRRR!!!!");
        disableGuessing();
        nextTurnButton.disabled = true;
    }
}

//----------------------------------
//Deck animation
//-------------------------------
function updateDeckVisual() {
    /*let pct = drawPile.length / deck.length;

    let deckElem = document.getElementById("deckVisual");

    let scale = 0.25 + (pct * 0.75);            // scale from 100% to 25%

    if (pct > 0.66) {
        deckElem.style.backgroundColor = "#A5D6A7";        //full
    } else if (pct > 0.33) {
        deckElem.style.backgroundColor = "#FFB7D5";        //medium
    } else {
        deckElem.style.backgroundColor = "#FF84BA";   //low
    }*/
   const deckElem = document.getElementById("deckStack");
   deckElem.innerHTML = ""; //clear old stack
   let pct = drawPile.length / deck.length;

   let layers = 0;
   if (pct > 0.80) layers = 5;
   else if (pct > 0.6) layers = 4;
   else if (pct > 0.4) layers = 3;
   else if (pct > 0.2) layers = 2;
   else if (pct > 0) layers = 1;
   else layers = 0;

   //build layers visually
   for (let i = 0; i < layers; i++) {
    let div = document.createElement("div");
    div.className = "cardLayer";
    div.style.top = (i * -3) + "px";                // stagger layers
    div.style.left = (i * 1) + "px";                // horizontal offset
    deckElem.appendChild(div);
   }
};



//--------------------------
//Steeping the Pot
//----------------------------
function steepThePot() {
    if (!canGuess) return;
    if (tableCards.length === 0) return;

    let pot = playerStacks[currentPlayer];
    pot.hidden.push(...tableCards.slice(0, -1));
    pot.top = tableCards[tableCards.length - 1];

    tableCards = [];
    document.getElementById("tableCards").innerHTML = "";
    document.getElementById("revealCard").innerHTML = "";
    showResult("Pot is Steeping! Continue to next turn.");

    disableGuessing();
    isSteepStart[currentPlayer] = true;  // MARK ONLY
};
//--------------------------
//Starting a turn after steeping the pot
//--------------------------
function startSteepedTurn() {
    let pot = playerStacks[currentPlayer];
    let topCard = pot.top;

    if (!topCard) {
        // Safety fallback
        dealFirstCard();
        return;
    }

    // Move top card out of the pot and onto the table
    pot.top = null;

    // Update table model
    tableCards = [topCard];

    // Render the card onto the table
    //document.getElementById("tableCards").innerHTML =
    //    `<div class="card">${topCard.suit} ${topCard.number}</div>`;
    const table = document.getElementById("tableCards");
    table.innerHTML = "";

    const cardElem = createCardElement(topCard);
    table.appendChild(cardElem);

    // Clear the reveal area (since we're starting fresh)
    document.getElementById("revealCard").innerHTML = "";

    enableGuessing();
}

function animateTokenToPlayer(tokenValue, playerIndex) {
    const pool = document.getElementById("scoreTokenDisplay");
    const playerPanel = document.getElementById("playerPanels").children[playerIndex];

    if (!pool || !playerPanel) return;

    // Find the token element in the pool (first match)
    const sourceTokenElem = [...pool.children].find(t => t.textContent == tokenValue);
    if (!sourceTokenElem) return;

    // Create flying clone
    const clone = sourceTokenElem.cloneNode(true);
    clone.classList.add("flyingToken");
    document.body.appendChild(clone);

    // Starting position (center of source token)
    const start = sourceTokenElem.getBoundingClientRect();
    clone.style.left = start.left + "px";
    clone.style.top = start.top + "px";

    // Target position (player token area)
    const targetArea = playerPanel.querySelector(".playerTokens");
    const end = targetArea.getBoundingClientRect();

    // Compute travel distance
    const dx = end.left - start.left;
    const dy = end.top - start.top;

    // Trigger animation after slight delay
    requestAnimationFrame(() => {
        clone.style.transform = `translate(${dx}px, ${dy}px) scale(0.6)`;
        clone.style.opacity = "0.2";
    });

    // Remove clone after animation
    setTimeout(() => {
        clone.remove();
    }, 650); // slightly longer than the transition
}

function animatePlayerTokensOut(playerIndex, tokenValues, callback) {
    const playerPanel = document.getElementById("playerPanels").children[playerIndex];
    const tokenArea = playerPanel.querySelector(".playerTokens");

    if (!tokenArea) {
        if (callback) callback();
        return;
    }

    // Animate each old token flying upward and fading
    tokenValues.forEach((val, i) => {
        const tokenElem = [...tokenArea.children].find(t => t.textContent == val);
        if (!tokenElem) return;

        const rect = tokenElem.getBoundingClientRect();

        const clone = tokenElem.cloneNode(true);
        clone.classList.add("flyingToken");
        document.body.appendChild(clone);

        clone.style.left = rect.left + "px";
        clone.style.top = rect.top + "px";

        // slight stagger for style
        setTimeout(() => {
            clone.style.transform = `translate(0px, -60px) scale(0.6)`;
            clone.style.opacity = "0";
        }, i * 80);

        setTimeout(() => clone.remove(), 700 + i * 80);
    });

    // Fire callback after animation completes (~800ms)
    setTimeout(() => {
        if (callback) callback();
    }, 850);
}

// -------------------------------
// Bank Points
// -------------------------------
// bankButton.addEventListener("click", function () {
//     if (!canGuess) return;

//     if (!hasGuessedThisTurn && !forcedBank) {
//         showResult("You must make your first guess before banking!");
//         return;
//     }

//     let pot = playerStacks[currentPlayer];
//     let points = tableCards.length + pot.hidden.length;
    
//     //Scoring Mode logic
//     if (scoringMode === "tokens" || scoringMode === "trade") {
//         if (!availableScoreTokens.includes(points)) {
//             showResult(points + "-point token is not available");
//             return;
//         }
//         //Claim token
//        // Save correct player BEFORE turn changes later
//         const tokenRecipient = currentPlayer;

//         // Remove the token from the pool immediately
//         availableScoreTokens = availableScoreTokens.filter(x => x !== points);

//         // Start the flying animation
//         animateTokenToPlayer(points, tokenRecipient);

//         // Delay adding the real token until animation finishes
//         setTimeout(() => {

//             // Give real token to the correct player
//             playerTokens[tokenRecipient].push(points);

//             handleTradeIn(tokenRecipient);

//             // Refresh displays after landing
//             updateScoreTokenDisplay();
//             updateScoreboard();

//         }, 650);  // same as animation time
//     }
//     forcedBank = false;
    
//     playerScores[currentPlayer] += points;

//     tableCards = [];
//     document.getElementById("tableCards").innerHTML = "";
//     document.getElementById("revealCard").innerHTML = "";

//     updateDeckVisual();

//     //handleTradeIn(currentPlayer);
//     updateScoreTokenDisplay();

//     // MOVE TO NEXT PLAYER FIRST
//     currentPlayer = (currentPlayer + turnDirection + numPlayers) % numPlayers;
//     hasGuessedThisTurn = false;

//     if (checkRoundEnd()) {
//         startNextRound();
//         return;
//     }

//     playerDisplay.textContent = "Current Player: " + (currentPlayer + 1);
//     //scoreDisplay.textContent = "Score: " + playerScores[currentPlayer];

//     updateScoreboard();

//     // NOW CHECK IF THIS NEXT PLAYER SHOULD START STEEPED
//     if (isSteepStart[currentPlayer] && playerStacks[currentPlayer].top) {
//         startSteepedTurn();
//         isSteepStart[currentPlayer] = false;
//         return;
//     }
//     tableCards = [];
//     document.getElementById("tableCards").innerHTML = "";
//     document.getElementById("revealCard").innerHTML = "";

//     dealFirstCard();
// });

bankButton.addEventListener("click", function () {
    if (!canGuess) return;

    // Normal players must have made at least one guess
    if (!hasGuessedThisTurn && !forcedBank) {
        showResult("You must make your first guess before banking!");
        return;
    }

    let pot = playerStacks[currentPlayer];
    let points = tableCards.length + pot.hidden.length;

    // =============================
    // SCORING MODE: TOKENS / TRADE
    // =============================
    if (scoringMode === "tokens" || scoringMode === "trade") {

        // Token must exist
        if (!availableScoreTokens.includes(points)) {
            showResult(points + "-point token is not available");
            return;
        }

        const tokenRecipient = currentPlayer; // capture BEFORE turn changes

        // Remove token from the pool immediately
        availableScoreTokens = availableScoreTokens.filter(x => x !== points);

        // Start flying animation
        animateTokenToPlayer(points, tokenRecipient);

        // Delay real token assignment until animation completes
        setTimeout(() => {

            playerTokens[tokenRecipient].push(points);

            // Check for trade-in (may trigger another animation)
            handleTradeIn(tokenRecipient);

            updateScoreTokenDisplay();
            updateScoreboard();

        }, 650);
    }

    // Allow banking without guessing ONLY if forced by Last Sip
    forcedBank = false;

    // =============================
    // ADD POINTS FOR THE TURN
    // =============================
    playerScores[currentPlayer] += points;

    // =============================
    // CLEAR TABLE (AFTER scoring)
    // =============================
    tableCards = [];
    document.getElementById("tableCards").innerHTML = "";
    document.getElementById("revealCard").innerHTML = "";

    updateDeckVisual();
    updateScoreTokenDisplay();

    // =============================
    // ADVANCE TURN
    // =============================
    currentPlayer = (currentPlayer + turnDirection + numPlayers) % numPlayers;
    hasGuessedThisTurn = false;

    // =============================
    // CHECK FOR ROUND END
    // =============================
    if (checkRoundEnd()) {
        startNextRound();
        return;
    }

    updateScoreboard();

    // =============================
    // START STEEPED TURN IF NEEDED
    // =============================
    if (isSteepStart[currentPlayer] && playerStacks[currentPlayer].top) {
        startSteepedTurn();
        isSteepStart[currentPlayer] = false;
        return;
    }

    // =============================
    // START NORMAL TURN
    // =============================
    dealFirstCard();
});

// -------------------------------
// Next Turn
// -------------------------------
nextTurnButton.addEventListener("click", function () {

    tableCards = [];
    document.getElementById("tableCards").innerHTML = "";
    document.getElementById("revealCard").innerHTML = "";
    document.getElementById("revealCard").innerHTML = "";
    enableGuessing();

    updateDeckVisual();

    //trade-in mode check
    handleTradeIn(currentPlayer);
    updateScoreTokenDisplay();

    // MOVE TO NEXT PLAYER FIRST
    currentPlayer = (currentPlayer + turnDirection + numPlayers) % numPlayers;
    hasGuessedThisTurn = false;

    if (checkRoundEnd()) {
        startNextRound();
        return;
    }

    playerDisplay.textContent = "Current Player: " + (currentPlayer + 1);
    //scoreDisplay.textContent = "Score: " + playerScores[currentPlayer];

    updateScoreboard();

    // NOW CHECK IF THIS NEXT PLAYER SHOULD START STEEPED
    if (isSteepStart[currentPlayer] && playerStacks[currentPlayer].top) {
        startSteepedTurn();
        isSteepStart[currentPlayer] = false;
        return;
    }
    resultDisplay.textContent = [];
    // OTHERWISE START NORMAL TURN
    dealFirstCard();
});

// -------------------------------
// Guess Buttons
// -------------------------------
matchButton.addEventListener("click", function () {
    drawCard("match");
});

noMatchButton.addEventListener("click", function () {
    drawCard("nomatch");
});

//---------------------
//Steep the Pot Button
//------------------------------
steepButton.addEventListener("click", steepThePot);

// -------------------------------
// New Game Button
// -------------------------------
newGameButton.addEventListener("click", startNewGame);

//---------------
//Rulebook
//----------------
// RULEBOOK BUTTON HANDLERS
const rulebookButton = document.getElementById("rulebookButton");
const rulebookPopup = document.getElementById("rulebookPopup");
const closeRulebook = document.getElementById("closeRulebook");

rulebookButton.addEventListener("click", () => {
    rulebookPopup.classList.add("show");
});

closeRulebook.addEventListener("click", () => {
    rulebookPopup.classList.remove("show");
});

// Close rulebook if clicking outside the window
rulebookPopup.addEventListener("click", (e) => {
    if (e.target === rulebookPopup) {
        rulebookPopup.classList.remove("show");
    }
});

// -------------------------------
// Start automatically
// -------------------------------
startNewGame();