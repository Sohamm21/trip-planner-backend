const DESTINATION_IMAGES = {
  'Rann of Kutch': 'https://res.cloudinary.com/dyrv985gb/image/upload/v1790484099/BhatakGo/rann_of_kutch.jpg',
  Jaipur: 'https://res.cloudinary.com/dyrv985gb/image/upload/v1790484205/BhatakGo/jaipur.jpg',
  Auli: 'https://res.cloudinary.com/dyrv985gb/image/upload/v1790484280/BhatakGo/auli.jpg',
  Goa: 'https://res.cloudinary.com/dyrv985gb/image/upload/v1790484331/BhatakGo/goa.jpg',
  Khajuraho: 'https://res.cloudinary.com/dyrv985gb/image/upload/v1790484422/BhatakGo/khajuraho.jpg',
  Hampi: 'https://res.cloudinary.com/dyrv985gb/image/upload/v1790484543/BhatakGo/hampi.jpg',
  Kashmir: 'https://res.cloudinary.com/dyrv985gb/image/upload/v1790484668/BhatakGo/kashmir.jpg',
  Coorg: 'https://res.cloudinary.com/dyrv985gb/image/upload/v1790484716/BhatakGo/coorg.jpg',
  Rishikesh: 'https://res.cloudinary.com/dyrv985gb/image/upload/v1790484765/BhatakGo/rishikesh.jpg',
  Munnar: 'https://res.cloudinary.com/dyrv985gb/image/upload/v1790484839/BhatakGo/munnar.jpg',
  Shimla: 'https://res.cloudinary.com/dyrv985gb/image/upload/v1790484878/BhatakGo/shimla.jpg',
  Manali: 'https://res.cloudinary.com/dyrv985gb/image/upload/v1790484947/BhatakGo/manali.jpg',
  Darjeeling: 'https://res.cloudinary.com/dyrv985gb/image/upload/v1790484979/BhatakGo/darjeeling.jpg',
  'Tirthan Valley': 'https://res.cloudinary.com/dyrv985gb/image/upload/v1790485027/BhatakGo/tirthan_valley.jpg',
  'Spiti Valley': 'https://res.cloudinary.com/dyrv985gb/image/upload/v1790485145/BhatakGo/spiti.jpg',
  Meghalaya: 'https://res.cloudinary.com/dyrv985gb/image/upload/v1790485172/BhatakGo/meghalaya.jpg',
  'Valley of Flowers': 'https://res.cloudinary.com/dyrv985gb/image/upload/v1790485250/BhatakGo/valley_of_flowers.jpg',
  Udaipur: 'https://res.cloudinary.com/dyrv985gb/image/upload/v1790485411/BhatakGo/udaipur.jpg',
  'Kerala Backwaters': 'https://res.cloudinary.com/dyrv985gb/image/upload/v1790485477/BhatakGo/kerala_backwaters.jpg',
  Ladakh: 'https://res.cloudinary.com/dyrv985gb/image/upload/v1790485500/BhatakGo/ladakh.jpg',
  Pushkar: 'https://res.cloudinary.com/dyrv985gb/image/upload/v1790485624/BhatakGo/pushkar.jpg',
  Nainital: 'https://res.cloudinary.com/dyrv985gb/image/upload/v1790485685/BhatakGo/nainital.jpg',
  Gokarna: 'https://res.cloudinary.com/dyrv985gb/image/upload/v1790485713/BhatakGo/gokarna.jpg',
  Jaisalmer: 'https://res.cloudinary.com/dyrv985gb/image/upload/v1790485831/BhatakGo/jaisalmer.jpg',
  Ooty: 'https://res.cloudinary.com/dyrv985gb/image/upload/v1790485859/BhatakGo/ooty.jpg',
  'Andaman Islands': 'https://res.cloudinary.com/dyrv985gb/image/upload/v1790485988/BhatakGo/andaman.jpg',
  Jodhpur: 'https://res.cloudinary.com/dyrv985gb/image/upload/v1790486035/BhatakGo/jodhpur.jpg',
  Sikkim: 'https://res.cloudinary.com/dyrv985gb/image/upload/v1790486085/BhatakGo/sikkim.jpg',
  Alleppey: 'https://res.cloudinary.com/dyrv985gb/image/upload/v1790486143/BhatakGo/alleppey.jpg',
};
const PLACEHOLDER_IMAGE = 'https://res.cloudinary.com/dyrv985gb/image/upload/v1790399857/BhatakGo/mountains_night.jpg';

const RAW_DESTINATIONS = {
  1: [
    {
      name: "Rann of Kutch",
      state: "Gujarat",
      tag: "Winter festivities",
      description: [
        "Explore the vast white salt desert.",
        "Experience Rann Utsav and local culture.",
        "Enjoy sunset views and full-moon nights."
      ]
    },
    {
      name: "Jaipur",
      state: "Rajasthan",
      tag: "Pleasant weather",
      description: [
        "Visit grand palaces and historic forts.",
        "Explore vibrant markets and local crafts.",
        "Enjoy comfortable weather for sightseeing."
      ]
    },
    {
      name: "Auli",
      state: "Uttarakhand",
      tag: "Snow season",
      description: [
        "Experience snowy Himalayan landscapes.",
        "Try skiing and other snow activities.",
        "Enjoy panoramic mountain views."
      ]
    }
  ],

  2: [
    {
      name: "Goa",
      state: "Goa",
      tag: "Beach season",
      description: [
        "Relax on golden beaches.",
        "Explore beach shacks and coastal cafes.",
        "Enjoy nightlife and water sports."
      ]
    },
    {
      name: "Khajuraho",
      state: "Madhya Pradesh",
      tag: "Pleasant weather",
      description: [
        "Explore intricately carved temples.",
        "Discover ancient architecture and history.",
        "Enjoy comfortable weather for sightseeing."
      ]
    },
    {
      name: "Hampi",
      state: "Karnataka",
      tag: "Ideal sightseeing",
      description: [
        "Explore the ruins of the Vijayanagara Empire.",
        "Discover giant boulders and ancient temples.",
        "Enjoy scenic walks and heritage sites."
      ]
    }
  ],

  3: [
    {
      name: "Kashmir",
      state: "Jammu & Kashmir",
      tag: "Tulip season",
      description: [
        "Visit the colourful Indira Gandhi Tulip Garden.",
        "Enjoy scenic lakes and mountain views.",
        "Experience the arrival of spring."
      ]
    },
    {
      name: "Coorg",
      state: "Karnataka",
      tag: "Coffee blossoms",
      description: [
        "Explore fragrant coffee plantations.",
        "Enjoy misty hills and scenic waterfalls.",
        "Discover local coffee estates and homestays."
      ]
    },
    {
      name: "Rishikesh",
      state: "Uttarakhand",
      tag: "Adventure season",
      description: [
        "Experience river rafting when available.",
        "Explore riverside cafes and yoga retreats.",
        "Enjoy scenic walks along the Ganges."
      ]
    }
  ],

  4: [
    {
      name: "Kashmir",
      state: "Jammu & Kashmir",
      tag: "Spring landscapes",
      description: [
        "Explore blooming gardens and valleys.",
        "Enjoy views of snow-capped mountains.",
        "Take a relaxing Shikara ride on Dal Lake."
      ]
    },
    {
      name: "Munnar",
      state: "Kerala",
      tag: "Tea gardens",
      description: [
        "Walk through rolling tea plantations.",
        "Explore misty hills and scenic viewpoints.",
        "Visit tea museums and local estates."
      ]
    },
    {
      name: "Shimla",
      state: "Himachal Pradesh",
      tag: "Pleasant spring",
      description: [
        "Stroll along the historic Mall Road.",
        "Explore colonial architecture and churches.",
        "Enjoy cool mountain air and scenic views."
      ]
    }
  ],

  5: [
    {
      name: "Manali",
      state: "Himachal Pradesh",
      tag: "Summer retreat",
      description: [
        "Enjoy scenic valleys and mountain views.",
        "Explore nearby villages and waterfalls.",
        "Try trekking and outdoor adventures."
      ]
    },
    {
      name: "Darjeeling",
      state: "West Bengal",
      tag: "Cool climate",
      description: [
        "Ride the famous Darjeeling Himalayan Railway.",
        "Explore lush tea estates.",
        "Enjoy panoramic views of the Himalayas."
      ]
    },
    {
      name: "Tirthan Valley",
      state: "Himachal Pradesh",
      tag: "Mountain escape",
      description: [
        "Discover peaceful riverside villages.",
        "Explore forest trails and mountain scenery.",
        "Enjoy trekking and nature stays."
      ]
    }
  ],

  6: [
    {
      name: "Spiti Valley",
      state: "Himachal Pradesh",
      tag: "High-altitude desert",
      description: [
        "Explore dramatic cold-desert landscapes.",
        "Visit ancient monasteries and remote villages.",
        "Enjoy scenic mountain road trips."
      ]
    },
    {
      name: "Coorg",
      state: "Karnataka",
      tag: "Monsoon onset",
      description: [
        "Experience lush green coffee plantations.",
        "Explore rain-fed waterfalls and forests.",
        "Enjoy peaceful monsoon homestays."
      ]
    },
    {
      name: "Meghalaya",
      state: "Meghalaya",
      tag: "Living root bridges",
      description: [
        "Discover the famous living root bridges.",
        "Explore dramatic waterfalls and caves.",
        "Experience the lush monsoon landscape."
      ]
    }
  ],

  7: [
    {
      name: "Valley of Flowers",
      state: "Uttarakhand",
      tag: "Monsoon bloom",
      description: [
        "Trek through colourful alpine meadows.",
        "Discover seasonal Himalayan wildflowers.",
        "Enjoy spectacular mountain scenery."
      ]
    },
    {
      name: "Munnar",
      state: "Kerala",
      tag: "Misty hills",
      description: [
        "Explore cloud-covered tea gardens.",
        "Discover lush green valleys and waterfalls.",
        "Enjoy cosy stays amid misty hills."
      ]
    },
    {
      name: "Udaipur",
      state: "Rajasthan",
      tag: "Monsoon romance",
      description: [
        "Explore beautiful lakeside palaces.",
        "Enjoy dramatic monsoon skies and lake views.",
        "Discover historic streets and rooftop cafes."
      ]
    }
  ],

  8: [
    {
      name: "Kerala Backwaters",
      state: "Kerala",
      tag: "Lush greenery",
      description: [
        "Cruise through peaceful canals and lagoons.",
        "Experience lush landscapes and village life.",
        "Enjoy traditional Kerala cuisine."
      ]
    },
    {
      name: "Ladakh",
      state: "Ladakh",
      tag: "Peak season",
      description: [
        "Drive across spectacular mountain passes.",
        "Explore monasteries and high-altitude lakes.",
        "Experience dramatic Himalayan landscapes."
      ]
    },
    {
      name: "Coorg",
      state: "Karnataka",
      tag: "Lush greenery",
      description: [
        "Explore waterfalls surrounded by greenery.",
        "Discover misty coffee estates and forests.",
        "Enjoy peaceful nature retreats."
      ]
    }
  ],

  9: [
    {
      name: "Pushkar",
      state: "Rajasthan",
      tag: "Post-monsoon",
      description: [
        "Visit the sacred Pushkar Lake.",
        "Explore colourful markets and temples.",
        "Enjoy the relaxed atmosphere of the desert town."
      ]
    },
    {
      name: "Nainital",
      state: "Uttarakhand",
      tag: "Clear lakes",
      description: [
        "Enjoy boating on Naini Lake.",
        "Explore scenic viewpoints and mountain trails.",
        "Discover charming cafes and local markets."
      ]
    },
    {
      name: "Gokarna",
      state: "Karnataka",
      tag: "Quiet beaches",
      description: [
        "Relax on peaceful coastal beaches.",
        "Explore scenic beach trekking routes.",
        "Discover laid-back seaside cafes."
      ]
    }
  ],

  10: [
    {
      name: "Jaisalmer",
      state: "Rajasthan",
      tag: "Desert season",
      description: [
        "Explore the magnificent Golden Fort.",
        "Enjoy camel safaris across sand dunes.",
        "Experience desert sunsets and cultural shows."
      ]
    },
    {
      name: "Ooty",
      state: "Tamil Nadu",
      tag: "Pleasant weather",
      description: [
        "Explore scenic tea gardens.",
        "Enjoy boating and walks around Ooty Lake.",
        "Ride the historic Nilgiri Mountain Railway."
      ]
    },
    {
      name: "Andaman Islands",
      state: "Andaman & Nicobar",
      tag: "Beach season begins",
      description: [
        "Relax on turquoise-water beaches.",
        "Explore coral reefs and marine life.",
        "Enjoy snorkelling and island excursions."
      ]
    }
  ],

  11: [
    {
      name: "Goa",
      state: "Goa",
      tag: "Peak season begins",
      description: [
        "Enjoy sunny beaches and coastal views.",
        "Explore lively markets and beach shacks.",
        "Experience festive events and nightlife."
      ]
    },
    {
      name: "Jodhpur",
      state: "Rajasthan",
      tag: "Clear skies",
      description: [
        "Explore the majestic Mehrangarh Fort.",
        "Discover the iconic blue city streets.",
        "Enjoy desert views and local cuisine."
      ]
    },
    {
      name: "Sikkim",
      state: "Sikkim",
      tag: "Mountain views",
      description: [
        "Enjoy views of the eastern Himalayas.",
        "Explore monasteries and mountain villages.",
        "Discover scenic lakes and alpine landscapes."
      ]
    }
  ],

  12: [
    {
      name: "Rann of Kutch",
      state: "Gujarat",
      tag: "Rann Utsav",
      description: [
        "Experience the vibrant Rann Utsav.",
        "Explore the vast white salt desert.",
        "Enjoy cultural performances and desert camping."
      ]
    },
    {
      name: "Manali",
      state: "Himachal Pradesh",
      tag: "Snow season",
      description: [
        "Experience snowy mountain landscapes.",
        "Enjoy winter activities when conditions permit.",
        "Relax in cosy cafes and mountain stays."
      ]
    },
    {
      name: "Alleppey",
      state: "Kerala",
      tag: "Houseboat season",
      description: [
        "Cruise through tranquil backwaters.",
        "Stay in traditional houseboats.",
        "Enjoy scenic canals and authentic Kerala cuisine."
      ]
    }
  ]
};
module.exports = { DESTINATION_IMAGES, PLACEHOLDER_IMAGE, RAW_DESTINATIONS };
