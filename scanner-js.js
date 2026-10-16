/**
 * Modulares Frontend: Zuerst CSS laden, dann JS-Logik
 * Für Android-Browser optimiert (Dark Mode + Touch-Friendly)
 */

(function() {
    'use strict';

    // === 1. Globale State-Variables ===
    let mode = "add";           // "add" | "remove" | "count-only"
    let lastScannedCode = "";   // Vermeidet flatternde Updates
    let lastScanTime = 0;       // Timestamp für Duplikat-Filtrierung
    
    // === 2. Haupt-Daten-Objekt (im Speicher) ===
    const products = {};        // { "123456": { rawName: "...", anzahl: 5 } }

    // === 3. DOM-Elemente direkt referenzieren ===
    const videoEl = document.getElementById("webcam");
    const overlayEl = document.getElementById("scan-overlay");
    const listEl = document.getElementById("bestand-liste");
    const totalEl = document.getElementById("total-count");

    // === 4. Kamera initialisieren ===
    function initCamera() {
        if (!barcodeDetector) return;
        
        navigator.mediaDevices.getUserMedia({ 
            video: { facingMode: "environment", width: 1280, height: 720 } 
        })
        .then(stream => {
            videoEl.srcObject = stream;
            videoEl.play(); // Sicherstellen dass es spielt
            overlayEl.style.display = "block"; // Overlay sichtbar machen
            scanSchleife(videoEl);
            
            // Falls die Kamera erst nach 200ms lädt:
            setTimeout(() => {
                if (videoEl.srcObject && !videoEl.paused) scanSchleife(videoEl);
            }, 300);
        })
        .catch(err => {
            console.error("Kamera-Zugriff:", err.message);
            document.getElementById("status-pill").innerText = "🔧 Tippe 'Kamera'";
        });
    }

    // === 5. Der intelligente Scan-Loop (mit 200ms Intervall) ===
    function scanSchleife(video) {
        setInterval(async () => {
            if (!barcodeDetector || video.paused || video.ended) return;
            
            try {
                const barcodes = await barcodeDetector.detect(video);
                
                if (barcodes.length > 0) {
                    let code = barcodes[0].rawValue; // Nimm den ersten Barcode
                    let now = Date.now();
                    
                    // Duplikat-Filter: Nur wenn >3 Sekunden seit letztem Scan vergangen
                    if (code === lastScannedCode && (now - lastScanTime) < 3000) {
                        return; // Zu früh nochmal gescannt!
                    }
                    
                    // Update State
                    lastScannedCode = code;
                    lastScanTime = now;

                    // Vibration für Android
                    if (window.navigator.vibrate) window.navigator.vibrate(100);

                    // Smarte Add/Remove Logik: Prüfe ob Produkt schon existiert
                    const currentProduct = products[code];
                    
                    if (mode === "add") {
                        if (!currentProduct) {
                            // Erstes Mal: Speichere mit "Neu:" Prefix
                            products[code] = { 
                                rawName: "", 
                                datum: "", 
                                ort: "",
                                fullName: "Neu: " + code, 
                                anzahl: 1 
                            };
                        } else {
                            // Bereits da -> Anzahl erhöhen
                            currentProduct.anzahl += 1;
                        }
                    } else if (mode === "remove") {
                        if (currentProduct) {
                            currentProduct.anzahl -= 1;
                            if (currentProduct.anzahl <= 0) delete products[code];
                        }
                    } else if (mode === "count-only") {
                        // Nur Zählen (für Debugging): Anzahl resetten auf 1
                        if (!currentProduct) products[code] = { anzahl: 1 };
                        else currentProduct.anzahl = 1;
                    }

                    // Speichere im LocalStorage (für Persistenz)
                    localStorage.setItem('barcodeProducts', JSON.stringify(products));
                    
                }
            } catch (e) {
                console.error("Scan-Loop Fehler:", e);
            }
        }, 200); // Nicht zu oft scannen, damit es flüssig bleibt!
    }

    // === 6. Der intelligente "Rename"-Knopf mit 3 Feldern ===
    function renameProduct(code) {
        let item = products[code];

        // 1. Name des Produkts (Falls leer: "Unbekannt")
        let nameInput = prompt("📦 Produktname eingeben:", item.rawName || "");
        if (nameInput !== null && nameInput.trim()) {
            item.rawName = nameInput.trim();
            
            // Update im Display
            updateListDisplay();
            
            // 2. Ablaufdatum
            let datumInput = prompt("⏱️ Ablaufdatum eingeben:", item.datum || "");
            if (datumInput !== null) item.datum = datumInput;
            
            // 3. Lagerort
            let ortInput = prompt("📍 Lagerort eingeben:", item.ort || "");
            if (ortInput !== null) item.ort = ortInput;

            // Speichere zurück
            localStorage.setItem('barcodeProducts', JSON.stringify(products));
        }
    }

    // === 7. Status-Label updater ===
    function setMode(newMode) {
        mode = newMode;
        
        const statusPill = document.getElementById("status-pill");
        
        if (mode === "add") {
            statusPill.innerText = "✅ HINZUFÜGEN";
            statusPill.style.background = "#00b300";
            
            // UI-Feedback: Button pulsiert
            const btnAdd = document.getElementById("btn-add");
            btnAdd.classList.add("pulsing");
        } else if (mode === "remove") {
            statusPill.innerText = "➖ ENTFERNEN";
            statusPill.style.background = "#d90000";
            
            const btnRemove = document.getElementById("btn-remove");
            btnRemove.classList.add("pulsing");
        } else if (mode === "count-only") {
            statusPill.innerText = "📊 ZÄHLMODUS";
            statusPill.style.background = "#ff9800";
        }

        // Button-Labels aktualisieren
        document.getElementById("btn-add").innerHTML = "+<br>Plus";
        document.getElementById("btn-remove").innerHTML = "−<br>Minus";
    }

    // === 8. Die Card-artige Listen-Ansicht ===
    function updateListDisplay() {
        const listDiv = document.getElementById("bestand-liste");
        
        if (Object.keys(products).length === 0) {
            listDiv.innerHTML = "<div style='text-align:center; color:#666;'>📦 Dein Bestand ist leer.<br>Tipp unten rechts zum Scannen!</div>";
            totalEl.innerText = "0";
            return;
        }

        let html = "";
        
        // Items sortieren: Zuerst die mit Namen, dann nach Anzahl (absteigend)
        const sortedCodes = Object.keys(products).sort((a, b) => {
            if (!products[b].rawName && products[a].rawName) return -1;
            if (products[b].rawName && products[a].rawName) return 1;
            
            // Falls beide ohne Name: nach Anzahl sortieren
            const anzahlA = parseInt(products[a].anzahl || "0");
            const anzahlB = parseInt(products[b].anzahl || "0");
            return anzahlB - anzahlA;
        });

        let totalCount = 0;

        for (let i = 0; i < sortedCodes.length; i++) {
            let code = sortedCodes[i];
            let item = products[code];
            
            // Fallback-Werte für den Anzeigename
            let anzeigeName = item.rawName || "Unbekannt";
            if (code.startsWith("Neu:")) anzeigeName = code.substring(4);
            
            // Bilde den Display-String mit Emojis
            let displayLine = `${item.anzahl}x <b>${anzeigeName}</b>`;
            
            if (item.datum) displayLine += " | ⏱️ " + item.datum;
            if (item.ort) displayLine += " | 📍 " + item.ort;

            // Button zum Umbenennen (nur bei Items mit Name, damit sie oben stehen)
            let btnText = item.rawName ? "🟪 ✎" : "";

            html += `<div class="product-item">
                        <div class="product-content">${displayLine}</div>
                        <button class="btn-rename" onclick="renameProduct('${code}')">${btnText}</button>
                     </div>`;
            
            totalCount++;
        }

        listDiv.innerHTML = html;
        totalEl.innerText = totalCount;
    }

    // === 9. Event-Listener für Touch/Click (Android optimiert) ===
    function attachEvents() {
        document.getElementById("btn-add").addEventListener('touchstart', (e) => {
            e.preventDefault(); // Verhindert Double-Fire auf Android
            setMode("add");
        });

        document.getElementById("btn-remove").addEventListener('touchstart', (e) => {
            e.preventDefault();
            setMode("remove");
        });
    }

    // === 10. Init-Funktion für den Start ===
    function initScanner() {
        if (!barcodeDetector) return; // Falls noch nicht geladen
        
        document.getElementById("status-pill").innerText = "📷 Kamera aktiv";
        
        initCamera();
        updateListDisplay();
        attachEvents();
        
        // LocalStorage prüfen (falls vorher gespeichert)
        let saved = localStorage.getItem('barcodeProducts');
        if (saved) {
            products[JSON.parse(saved)];
            updateListDisplay();
        }
    }

    // === 11. Expose global Functions für Inline-Fallback ===
    window.initScanner = initScanner;
    window.setMode = setMode;
    window.renameProduct = renameProduct;

    // Auto-Init wenn DOM geladen ist
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", () => initScanner());
    } else {
        // Browser hat sofort das Script gefunden!
        initScanner();
    }

})();