package com.interflu.inventory.service;

import com.interflu.inventory.dto.ProductDto;
import com.interflu.inventory.model.Product;
import com.interflu.inventory.repository.ProductRepository;
import org.springframework.data.domain.PageRequest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.sql.PreparedStatement;
import java.time.LocalDateTime;
import java.util.*;

@Service
public class ProductService {

    private final ProductRepository productRepository;
    private final JdbcTemplate jdbcTemplate;

    public ProductService(ProductRepository productRepository, JdbcTemplate jdbcTemplate) {
        this.productRepository = productRepository;
        this.jdbcTemplate = jdbcTemplate;
    }

    @Transactional(readOnly = true)
    public List<ProductDto> search(String query, boolean hideSaeStock) {
        if (query == null || query.trim().isEmpty()) {
            return Collections.emptyList();
        }
        String term = query.trim();
        return productRepository.searchFast(term, PageRequest.of(0, 25))
                .stream()
                .map(p -> ProductDto.from(p, hideSaeStock))
                .toList();
    }

    @Transactional(readOnly = true)
    public Optional<ProductDto> findByCode(String code, boolean hideSaeStock) {
        if (code == null || code.trim().isEmpty()) return Optional.empty();
        return productRepository.findByCodeIgnoreCase(code.trim())
                .map(p -> ProductDto.from(p, hideSaeStock));
    }

    public long countProducts() {
        return productRepository.countActive();
    }

    /**
     * Imports products from CSV/TXT (compatible with Aspel SAE catalog export: CVE_ART, DESCR, UNI_MED, LIN_PROD, EXIST)
     */
    @Transactional
    public Map<String, Object> importCatalogCsv(MultipartFile file) throws Exception {
        int inserted = 0;
        int updated = 0;
        List<String[]> rows = new ArrayList<>();

        try (BufferedReader reader = new BufferedReader(new InputStreamReader(file.getInputStream(), StandardCharsets.UTF_8))) {
            String line;
            boolean firstLine = true;
            while ((line = reader.readLine()) != null) {
                if (line.trim().isEmpty()) continue;
                // Support comma, semicolon, or tab separator
                String sep = line.contains("\t") ? "\t" : (line.contains(";") ? ";" : ",");
                String[] parts = line.split(sep, -1);
                if (firstLine) {
                    firstLine = false;
                    String header = parts[0].replace("\"", "").trim().toUpperCase();
                    if (header.equals("CVE_ART") || header.equals("CODIGO") || header.equals("CODE")) {
                        continue; // skip header
                    }
                }
                if (parts.length >= 2) {
                    rows.add(parts);
                }
            }
        }

        String now = LocalDateTime.now().toString();
        for (String[] parts : rows) {
            String code = clean(parts[0]);
            if (code.isEmpty()) continue;
            String desc = parts.length > 1 ? clean(parts[1]) : code;
            String unit = parts.length > 2 && !clean(parts[2]).isEmpty() ? clean(parts[2]) : "PZA";
            String lineCat = parts.length > 3 ? clean(parts[3]) : "GENERAL";
            double stock = 0.0;
            if (parts.length > 4) {
                try {
                    stock = Double.parseDouble(clean(parts[4]));
                } catch (NumberFormatException ignored) {}
            }

            Optional<Product> existing = productRepository.findByCodeIgnoreCase(code);
            if (existing.isPresent()) {
                Product p = existing.get();
                p.setDescription(desc);
                p.setUnit(unit);
                p.setLine(lineCat);
                p.setStockSaE(stock);
                p.setUpdatedAt(LocalDateTime.now());
                productRepository.save(p);
                updated++;
            } else {
                Product p = new Product(code, desc, unit, lineCat, "ALM-01", stock);
                productRepository.save(p);
                inserted++;
            }
        }

        Map<String, Object> result = new HashMap<>();
        result.put("inserted", inserted);
        result.put("updated", updated);
        result.put("totalProcessed", inserted + updated);
        result.put("totalCatalog", countProducts());
        return result;
    }

    /**
     * Generates 22,000 realistic Interflu industrial fluid products via batch JDBC insert
     * to benchmark and validate real-world search speed over >22k SKUs.
     */
    @Transactional
    public void seed22kCatalogIfEmpty() {
        long count = productRepository.count();
        if (count >= 100) {
            return;
        }

        String[] prefixes = {"VAL", "MAN", "CON", "BOM", "EMP", "FIL", "REG", "CIL", "ACO", "BRIDA"};
        String[] families = {
            "Válvula Esfera Bronce NPT",
            "Manguera Hidráulica Alta Presión SAE 100R2",
            "Conector Rápido Macho Acero Inox",
            "Bomba Centrífuga Industrial",
            "Empaque Viton Alta Temperatura",
            "Filtro de Aire Comprimido Micras",
            "Regulador de Presión Neumático",
            "Cilindro Neumático Doble Efecto",
            "Acoplamiento JIC Hembra Giratorio",
            "Brida Soldable Acero Carbón C150"
        };
        String[] lines = {"VALVULAS", "MANGUERAS", "CONEXIONES", "BOMBEO", "SELLOS", "NEUMATICA", "HIDRAULICA"};
        String[] units = {"PZA", "MTO", "JGO", "PZA", "PZA", "PZA", "PZA", "PZA", "PZA", "PZA"};
        String[] sizes = {"1/8\"", "1/4\"", "3/8\"", "1/2\"", "3/4\"", "1\"", "1-1/4\"", "1-1/2\"", "2\"", "3\"", "4\""};

        String sql = "INSERT OR IGNORE INTO products (code, description, unit, line, location_sae, stock_sae, active, updated_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?)";
        String now = LocalDateTime.now().format(java.time.format.DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss.SSS"));
        Random rnd = new Random(2026);

        // First insert 20 curated realistic Interflu pilot items for immediate easy testing
        List<Object[]> batch = new ArrayList<>(22050);
        String[][] pilotItems = {
            {"VAL-ESF-1/2", "Válvula Esfera Bronce Roscada 1/2 NPT 600 WOG", "PZA", "VALVULAS", "ANQ-A01", "48"},
            {"VAL-ESF-3/4", "Válvula Esfera Bronce Roscada 3/4 NPT 600 WOG", "PZA", "VALVULAS", "ANQ-A01", "32"},
            {"VAL-CHK-1", "Válvula Check Columpio Bronce 1 NPT", "PZA", "VALVULAS", "ANQ-A01", "15"},
            {"VAL-AGU-1/4", "Válvula de Aguja Acero Inox 316 1/4 NPT", "PZA", "VALVULAS", "ANQ-A02", "24"},
            {"MAN-HID-3/8", "Manguera Hidráulica 3/8 SAE 100R2AT 4800 PSI", "MTO", "MANGUERAS", "ANQ-B01", "150"},
            {"MAN-HID-1/2", "Manguera Hidráulica 1/2 SAE 100R2AT 4000 PSI", "MTO", "MANGUERAS", "ANQ-B01", "120"},
            {"MAN-AIR-1/2", "Manguera Aire Multipropósito 1/2 Rojo 300 PSI", "MTO", "MANGUERAS", "ANQ-B02", "200"},
            {"CON-JIC-3/8", "Conector Prensable JIC Hembra 3/8 x 3/8", "PZA", "CONEXIONES", "ANQ-C01", "180"},
            {"CON-NPT-1/2", "Niple Hexagonal Acero Inoxidable 1/2 NPT", "PZA", "CONEXIONES", "ANQ-C01", "95"},
            {"CON-RAP-1/4", "Cople Rápido Neumático Industrial 1/4 NPT", "PZA", "NEUMATICA", "ANQ-C02", "64"},
            {"MAN-GLC-100", "Manómetro Glicerina Carátula 2.5\" 0-100 PSI 1/4 NPT", "PZA", "INSTRUMENTACION", "ANQ-D01", "22"},
            {"MAN-GLC-3000", "Manómetro Glicerina Carátula 2.5\" 0-3000 PSI 1/4 NPT", "PZA", "INSTRUMENTACION", "ANQ-D01", "18"},
            {"FIL-AIR-1/2", "Filtro Regulador Lubricador FRL 1/2 NPT", "JGO", "NEUMATICA", "ANQ-D02", "12"},
            {"EMP-VIT-018", "O-Ring Viton Medida -018 Dureza 75 Shore A", "PZA", "SELLOS", "ANQ-E01", "500"},
            {"EMP-NBR-214", "O-Ring Nitrilo Buna-N Medida -214", "PZA", "SELLOS", "ANQ-E01", "340"}
        };

        for (String[] item : pilotItems) {
            batch.add(new Object[]{item[0], item[1], item[2], item[3], item[4], Double.parseDouble(item[5]), now});
        }

        // Generate up to 22,000 SKUs
        for (int i = 1; i <= 22000; i++) {
            int pIdx = i % prefixes.length;
            String size = sizes[i % sizes.length];
            String code = String.format("%s-%05d", prefixes[pIdx], i);
            String desc = String.format("%s %s Serie %d Industrial", families[pIdx], size, (i % 900) + 100);
            String unit = units[pIdx];
            String line = lines[i % lines.length];
            String loc = String.format("ANQ-%s%02d", (char)('A' + (i % 6)), (i % 12) + 1);
            double stock = (double) rnd.nextInt(120);
            batch.add(new Object[]{code, desc, unit, line, loc, stock, now});
        }

        jdbcTemplate.batchUpdate(sql, batch, batch.size(), (PreparedStatement ps, Object[] args) -> {
            ps.setString(1, (String) args[0]);
            ps.setString(2, (String) args[1]);
            ps.setString(3, (String) args[2]);
            ps.setString(4, (String) args[3]);
            ps.setString(5, (String) args[4]);
            ps.setDouble(6, (Double) args[5]);
            ps.setString(7, (String) args[6]);
        });
    }

    private String clean(String s) {
        return s == null ? "" : s.replace("\"", "").trim();
    }
}
