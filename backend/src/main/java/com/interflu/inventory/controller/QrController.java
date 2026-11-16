package com.interflu.inventory.controller;

import com.google.zxing.BarcodeFormat;
import com.google.zxing.EncodeHintType;
import com.google.zxing.client.j2se.MatrixToImageWriter;
import com.google.zxing.common.BitMatrix;
import com.google.zxing.qrcode.QRCodeWriter;
import com.google.zxing.qrcode.decoder.ErrorCorrectionLevel;
import com.interflu.inventory.model.CountRecord;
import com.interflu.inventory.model.InventorySession;
import com.interflu.inventory.model.Product;
import com.interflu.inventory.model.Shelf;
import com.interflu.inventory.repository.CountRecordRepository;
import com.interflu.inventory.repository.InventorySessionRepository;
import com.interflu.inventory.repository.ProductRepository;
import com.interflu.inventory.repository.ShelfRepository;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.io.ByteArrayOutputStream;
import java.util.*;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

@RestController
@RequestMapping("/api/qr")
public class QrController {

    private final CountRecordRepository countRepo;
    private final ShelfRepository shelfRepo;
    private final InventorySessionRepository sessionRepo;
    private final ProductRepository productRepo;

    public QrController(CountRecordRepository countRepo,
                        ShelfRepository shelfRepo,
                        InventorySessionRepository sessionRepo,
                        ProductRepository productRepo) {
        this.countRepo = countRepo;
        this.shelfRepo = shelfRepo;
        this.sessionRepo = sessionRepo;
        this.productRepo = productRepo;
    }

    @GetMapping(value = "/image", produces = MediaType.IMAGE_PNG_VALUE)
    public ResponseEntity<byte[]> generateQr(@RequestParam String text,
                                             @RequestParam(defaultValue = "350") int size) {
        try {
            byte[] bytes = createQrPng(text, size);
            return ResponseEntity.ok()
                    .contentType(MediaType.IMAGE_PNG)
                    .body(bytes);
        } catch (Exception e) {
            return ResponseEntity.badRequest().build();
        }
    }

    /**
     * Download pure PNG image of a single material QR code named <CODE>.png
     */
    @GetMapping(value = "/material/{code}", produces = MediaType.IMAGE_PNG_VALUE)
    public ResponseEntity<byte[]> downloadMaterialQr(@PathVariable String code,
                                                     @RequestParam(defaultValue = "500") int size) {
        try {
            String cleanCode = code.trim().toUpperCase();
            String safeFilename = sanitizeFilename(cleanCode) + ".png";
            byte[] bytes = createQrPng(cleanCode, size);

            return ResponseEntity.ok()
                    .contentType(MediaType.IMAGE_PNG)
                    .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"" + safeFilename + "\"")
                    .body(bytes);
        } catch (Exception e) {
            return ResponseEntity.badRequest().build();
        }
    }

    /**
     * Download ZIP containing all material QR codes (<CODE>.png) for a single shelf
     */
    @GetMapping(value = "/shelf/{shelfId}/materials-zip", produces = "application/zip")
    public ResponseEntity<byte[]> downloadShelfMaterialsZip(@PathVariable Long shelfId,
                                                            @RequestParam Long sessionId) {
        try {
            Shelf shelf = shelfRepo.findById(shelfId)
                    .orElseThrow(() -> new IllegalArgumentException("Anaquel no encontrado"));

            List<CountRecord> records = countRepo.findBySessionIdAndShelfIdOrderByIdAsc(sessionId, shelfId);
            Set<String> uniqueCodes = new LinkedHashSet<>();
            for (CountRecord r : records) {
                if (r.getCapturedCode() != null && !r.getCapturedCode().isBlank()) {
                    uniqueCodes.add(r.getCapturedCode().trim().toUpperCase());
                }
            }

            ByteArrayOutputStream baos = new ByteArrayOutputStream();
            try (ZipOutputStream zos = new ZipOutputStream(baos)) {
                for (String code : uniqueCodes) {
                    byte[] pngBytes = createQrPng(code, 400);
                    String fileName = sanitizeFilename(code) + ".png";
                    ZipEntry entry = new ZipEntry(fileName);
                    zos.putNextEntry(entry);
                    zos.write(pngBytes);
                    zos.closeEntry();
                }
            }

            String zipName = "QRs_" + sanitizeFilename(shelf.getCode()) + "_materiales.zip";
            return ResponseEntity.ok()
                    .contentType(MediaType.parseMediaType("application/zip"))
                    .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"" + zipName + "\"")
                    .body(baos.toByteArray());
        } catch (Exception e) {
            return ResponseEntity.badRequest().build();
        }
    }

    /**
     * Download complete batch ZIP containing all material QR codes across ALL shelves for a session,
     * organized in subfolders by shelf (<SHELF_CODE>/<CODE>.png)
     */
    @GetMapping(value = "/session/{sessionId}/materials-batch-zip", produces = "application/zip")
    public ResponseEntity<byte[]> downloadSessionMaterialsBatchZip(@PathVariable Long sessionId) {
        try {
            InventorySession session = sessionRepo.findById(sessionId)
                    .orElseThrow(() -> new IllegalArgumentException("Sesión no encontrada"));

            List<CountRecord> records = countRepo.findBySessionIdOrderByUpdatedAtDesc(sessionId);

            Map<String, Set<String>> shelfToCodes = new LinkedHashMap<>();
            for (CountRecord r : records) {
                if (r.getCapturedCode() == null || r.getCapturedCode().isBlank()) continue;
                String shelfCode = r.getShelf() != null ? r.getShelf().getCode() : "SIN_UBIC";
                shelfToCodes.computeIfAbsent(shelfCode, k -> new LinkedHashSet<>())
                        .add(r.getCapturedCode().trim().toUpperCase());
            }

            ByteArrayOutputStream baos = new ByteArrayOutputStream();
            try (ZipOutputStream zos = new ZipOutputStream(baos)) {
                for (Map.Entry<String, Set<String>> entry : shelfToCodes.entrySet()) {
                    String shelfFolder = sanitizeFilename(entry.getKey());
                    for (String code : entry.getValue()) {
                        byte[] pngBytes = createQrPng(code, 400);
                        String entryPath = shelfFolder + "/" + sanitizeFilename(code) + ".png";
                        ZipEntry zipEntry = new ZipEntry(entryPath);
                        zos.putNextEntry(zipEntry);
                        zos.write(pngBytes);
                        zos.closeEntry();
                    }
                }
            }

            String zipName = "Lote_Completo_Materiales_QRs_" + sanitizeFilename(session.getFolio()) + ".zip";
            return ResponseEntity.ok()
                    .contentType(MediaType.parseMediaType("application/zip"))
                    .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"" + zipName + "\"")
                    .body(baos.toByteArray());
        } catch (Exception e) {
            return ResponseEntity.badRequest().build();
        }
    }

    private byte[] createQrPng(String text, int size) throws Exception {
        Map<EncodeHintType, Object> hints = new EnumMap<>(EncodeHintType.class);
        hints.put(EncodeHintType.ERROR_CORRECTION, ErrorCorrectionLevel.H);
        hints.put(EncodeHintType.MARGIN, 2);
        hints.put(EncodeHintType.CHARACTER_SET, "UTF-8");

        QRCodeWriter writer = new QRCodeWriter();
        BitMatrix bitMatrix = writer.encode(text, BarcodeFormat.QR_CODE, size, size, hints);
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        MatrixToImageWriter.writeToStream(bitMatrix, "PNG", out);
        return out.toByteArray();
    }

    private String sanitizeFilename(String input) {
        if (input == null) return "codigo";
        return input.replaceAll("[/\\\\:*?\"<>|]", "_").replaceAll("\\s+", "_").trim();
    }
}
