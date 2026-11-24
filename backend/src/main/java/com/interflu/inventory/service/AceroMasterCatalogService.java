package com.interflu.inventory.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.annotation.PostConstruct;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Service;

import java.io.InputStream;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Service
public class AceroMasterCatalogService {

    private static final Logger log = LoggerFactory.getLogger(AceroMasterCatalogService.class);

    public static class AceroLocationItem {
        public String code;
        public String plant;
        public String aisle;
        public String shelfNum;
        public String level;
        public String position;
        public String locationCode;
        public String shelfCode;
    }

    private final Map<String, AceroLocationItem> byCode = new HashMap<>();
    private final Map<String, AceroLocationItem> byLocationCode = new HashMap<>();

    @PostConstruct
    public void init() {
        try {
            ClassPathResource resource = new ClassPathResource("data/acero_catalog.json");
            if (resource.exists()) {
                ObjectMapper mapper = new ObjectMapper();
                try (InputStream is = resource.getInputStream()) {
                    List<AceroLocationItem> list = mapper.readValue(is, new TypeReference<List<AceroLocationItem>>() {});
                    for (AceroLocationItem item : list) {
                        if (item.code != null && !item.code.isBlank()) {
                            byCode.put(item.code.trim().toUpperCase(), item);
                        }
                        if (item.locationCode != null && !item.locationCode.isBlank()) {
                            byLocationCode.put(item.locationCode.trim().toUpperCase(), item);
                        }
                    }
                    log.info("Catálogo maestro de Acero cargado con {} referencias físicas.", byCode.size());
                }
            } else {
                log.warn("Archivo data/acero_catalog.json no encontrado en classpath.");
            }
        } catch (Exception e) {
            log.error("Error al cargar catálogo maestro de Acero: {}", e.getMessage(), e);
        }
    }

    public AceroLocationItem findByCode(String code) {
        if (code == null) return null;
        return byCode.get(code.trim().toUpperCase());
    }

    public AceroLocationItem findByLocationCode(String loc) {
        if (loc == null) return null;
        return byLocationCode.get(loc.trim().toUpperCase());
    }

    public Map<String, AceroLocationItem> getAllByCode() {
        return byCode;
    }
}
