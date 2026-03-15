# Seed data for apartments - Airtable-ready structure with coordinates
# City center coordinates for approximate locations
CITY_COORDINATES = {
    "Zurich": {"lat": 47.3769, "lng": 8.5417},
    "Geneva": {"lat": 46.2044, "lng": 6.1432},
    "Basel": {"lat": 47.5596, "lng": 7.5886},
    "Zug": {"lat": 47.1724, "lng": 8.5180},
}

SEED_APARTMENTS = [
    {
        "id": "apt-001",
        "title": {
            "de": "Moderne 2-Zimmer-Wohnung im Zentrum",
            "en": "Modern 2-Bedroom Apartment in City Center"
        },
        "location": "Zurich",
        "city": {"de": "Zürich", "en": "Zurich"},
        "coordinates": {"lat": 47.3769, "lng": 8.5417},
        "price": 3200,
        "bedrooms": 2,
        "bathrooms": 1,
        "sqm": 75,
        "image": "https://images.pexels.com/photos/15031994/pexels-photo-15031994.jpeg",
        "images": [
            "https://images.pexels.com/photos/15031994/pexels-photo-15031994.jpeg",
            "https://images.pexels.com/photos/1571460/pexels-photo-1571460.jpeg",
            "https://images.pexels.com/photos/2724749/pexels-photo-2724749.jpeg",
            "https://images.pexels.com/photos/1457842/pexels-photo-1457842.jpeg"
        ],
        "description": {
            "de": "Stilvolle möblierte Wohnung in Top-Lage, perfekt für Professionals und Expats",
            "en": "Stylish furnished apartment in prime location, perfect for professionals and expats"
        },
        "amenities": {
            "de": ["Voll möbliert", "High-Speed Internet", "Küche ausgestattet", "Balkon", "Waschmaschine"],
            "en": ["Fully furnished", "High-speed internet", "Equipped kitchen", "Balcony", "Washing machine"]
        },
        "is_active": True
    },
    {
        "id": "apt-002",
        "title": {
            "de": "Luxus-Studio am See",
            "en": "Luxury Studio by the Lake"
        },
        "location": "Zurich",
        "city": {"de": "Zürich", "en": "Zurich"},
        "coordinates": {"lat": 47.3667, "lng": 8.5500},
        "price": 2400,
        "bedrooms": 1,
        "bathrooms": 1,
        "sqm": 45,
        "image": "https://images.pexels.com/photos/15031992/pexels-photo-15031992.jpeg",
        "images": [
            "https://images.pexels.com/photos/15031992/pexels-photo-15031992.jpeg",
            "https://images.pexels.com/photos/1643384/pexels-photo-1643384.jpeg",
            "https://images.pexels.com/photos/3773575/pexels-photo-3773575.png",
            "https://images.pexels.com/photos/3773581/pexels-photo-3773581.png"
        ],
        "description": {
            "de": "Elegantes Studio mit Seeblick, ideal für Singles und Geschäftsreisende",
            "en": "Elegant studio with lake view, ideal for singles and business travelers"
        },
        "amenities": {
            "de": ["Seeblick", "Möbliert", "Internet inklusive", "Moderne Küche", "24/7 Concierge"],
            "en": ["Lake view", "Furnished", "Internet included", "Modern kitchen", "24/7 concierge"]
        },
        "is_active": True
    },
    {
        "id": "apt-003",
        "title": {
            "de": "Geräumige 3-Zimmer-Wohnung",
            "en": "Spacious 3-Bedroom Apartment"
        },
        "location": "Geneva",
        "city": {"de": "Genf", "en": "Geneva"},
        "coordinates": {"lat": 46.2044, "lng": 6.1432},
        "price": 4200,
        "bedrooms": 3,
        "bathrooms": 2,
        "sqm": 110,
        "image": "https://images.pexels.com/photos/271743/pexels-photo-271743.jpeg",
        "images": [
            "https://images.pexels.com/photos/271743/pexels-photo-271743.jpeg",
            "https://images.pexels.com/photos/1648776/pexels-photo-1648776.jpeg",
            "https://images.pexels.com/photos/2062431/pexels-photo-2062431.jpeg",
            "https://images.pexels.com/photos/2089698/pexels-photo-2089698.jpeg"
        ],
        "description": {
            "de": "Grosszügige Wohnung für Familien oder Geschäftsteams",
            "en": "Generous apartment for families or business teams"
        },
        "amenities": {
            "de": ["3 Schlafzimmer", "2 Badezimmer", "Komplett ausgestattet", "Parkplatz", "Nähe UN"],
            "en": ["3 bedrooms", "2 bathrooms", "Fully equipped", "Parking", "Near UN"]
        },
        "is_active": True
    },
    {
        "id": "apt-004",
        "title": {
            "de": "Business-Apartment im Finanzviertel",
            "en": "Business Apartment in Financial District"
        },
        "location": "Zurich",
        "city": {"de": "Zürich", "en": "Zurich"},
        "coordinates": {"lat": 47.3686, "lng": 8.5391},
        "price": 2900,
        "bedrooms": 1,
        "bathrooms": 1,
        "sqm": 55,
        "image": "https://images.pexels.com/photos/439227/pexels-photo-439227.jpeg",
        "images": [
            "https://images.pexels.com/photos/439227/pexels-photo-439227.jpeg",
            "https://images.pexels.com/photos/3935333/pexels-photo-3935333.jpeg",
            "https://images.pexels.com/photos/3935350/pexels-photo-3935350.jpeg",
            "https://images.pexels.com/photos/4050318/pexels-photo-4050318.jpeg"
        ],
        "description": {
            "de": "Perfekt für Banker und Finanzprofessionals, zentrale Lage",
            "en": "Perfect for bankers and finance professionals, central location"
        },
        "amenities": {
            "de": ["Arbeitsbereich", "Schnelles WLAN", "Klimaanlage", "Fitnessraum", "Nähe Paradeplatz"],
            "en": ["Workspace", "Fast WiFi", "Air conditioning", "Gym", "Near Paradeplatz"]
        },
        "is_active": True
    },
    {
        "id": "apt-005",
        "title": {
            "de": "Co-Living Studio für junge Professionals",
            "en": "Co-Living Studio for Young Professionals"
        },
        "location": "Basel",
        "city": {"de": "Basel", "en": "Basel"},
        "coordinates": {"lat": 47.5596, "lng": 7.5886},
        "price": 1800,
        "bedrooms": 1,
        "bathrooms": 1,
        "sqm": 35,
        "image": "https://images.unsplash.com/photo-1556911220-bff31c812dba",
        "images": [
            "https://images.unsplash.com/photo-1556911220-bff31c812dba",
            "https://images.unsplash.com/photo-1502672260266-1c1ef2d93688",
            "https://images.unsplash.com/photo-1560448204-e02f11c3d0e2",
            "https://images.unsplash.com/photo-1560185007-cde436f6a4d0"
        ],
        "description": {
            "de": "Modernes Co-Living-Konzept mit Gemeinschaftsräumen",
            "en": "Modern co-living concept with shared spaces"
        },
        "amenities": {
            "de": ["Gemeinschaftsküche", "Lounge", "Coworking Space", "Events", "Reinigung"],
            "en": ["Shared kitchen", "Lounge", "Coworking space", "Events", "Cleaning"]
        },
        "is_active": True
    },
    {
        "id": "apt-006",
        "title": {
            "de": "Penthouse mit Bergblick",
            "en": "Penthouse with Mountain View"
        },
        "location": "Zug",
        "city": {"de": "Zug", "en": "Zug"},
        "coordinates": {"lat": 47.1724, "lng": 8.5180},
        "price": 5500,
        "bedrooms": 3,
        "bathrooms": 2,
        "sqm": 135,
        "image": "https://images.unsplash.com/photo-1600489000022-c2086d79f9d4",
        "images": [
            "https://images.unsplash.com/photo-1600489000022-c2086d79f9d4",
            "https://images.unsplash.com/photo-1600566753190-17f0baa2a6c3",
            "https://images.unsplash.com/photo-1600607687939-ce8a6c25118c",
            "https://images.unsplash.com/photo-1600585154340-be6161a56a0c"
        ],
        "description": {
            "de": "Exklusives Penthouse mit atemberaubender Aussicht",
            "en": "Exclusive penthouse with breathtaking views"
        },
        "amenities": {
            "de": ["Dachterrasse", "Bergblick", "Premium-Ausstattung", "2 Parkplätze", "Sauna"],
            "en": ["Roof terrace", "Mountain view", "Premium equipment", "2 parking spaces", "Sauna"]
        },
        "is_active": True
    },
    {
        "id": "apt-007",
        "title": {
            "de": "Charmante Altstadt-Wohnung",
            "en": "Charming Old Town Apartment"
        },
        "location": "Geneva",
        "city": {"de": "Genf", "en": "Geneva"},
        "coordinates": {"lat": 46.2000, "lng": 6.1500},
        "price": 3600,
        "bedrooms": 2,
        "bathrooms": 1,
        "sqm": 80,
        "image": "https://images.unsplash.com/photo-1484154218962-a197022b5858",
        "images": [
            "https://images.unsplash.com/photo-1484154218962-a197022b5858",
            "https://images.unsplash.com/photo-1493809842364-78817add7ffb",
            "https://images.unsplash.com/photo-1507089947368-19c1da9775ae",
            "https://images.unsplash.com/photo-1505691938895-1758d7feb511"
        ],
        "description": {
            "de": "Stilvolle Wohnung im historischen Zentrum von Genf",
            "en": "Stylish apartment in Geneva's historic center"
        },
        "amenities": {
            "de": ["Altstadtlage", "Historisches Gebäude", "Moderne Ausstattung", "Nähe See", "Shops"],
            "en": ["Old town location", "Historic building", "Modern equipment", "Near lake", "Shops"]
        },
        "is_active": True
    },
    {
        "id": "apt-008",
        "title": {
            "de": "Smart-Apartment für Technologie-Professionals",
            "en": "Smart Apartment for Tech Professionals"
        },
        "location": "Zurich",
        "city": {"de": "Zürich", "en": "Zurich"},
        "coordinates": {"lat": 47.3900, "lng": 8.5150},
        "price": 3100,
        "bedrooms": 2,
        "bathrooms": 1,
        "sqm": 70,
        "image": "https://images.pexels.com/photos/35428064/pexels-photo-35428064.jpeg",
        "images": [
            "https://images.pexels.com/photos/35428064/pexels-photo-35428064.jpeg",
            "https://images.pexels.com/photos/1571468/pexels-photo-1571468.jpeg",
            "https://images.pexels.com/photos/276554/pexels-photo-276554.jpeg",
            "https://images.pexels.com/photos/1080721/pexels-photo-1080721.jpeg"
        ],
        "description": {
            "de": "High-Tech Wohnung mit Smart-Home-Integration",
            "en": "High-tech apartment with smart home integration"
        },
        "amenities": {
            "de": ["Smart Home", "Glasfaser", "Ergonomisches Office", "E-Ladestation", "Tech-Hub nähe"],
            "en": ["Smart home", "Fiber optic", "Ergonomic office", "E-charging", "Near tech hub"]
        },
        "is_active": True
    }
]
