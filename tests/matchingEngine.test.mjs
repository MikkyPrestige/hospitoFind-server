import { matchHospitals } from "../utils/matchingEngine.js";

const hospitals = [
  {
    _id: "1",
    name: "City Heart Center",
    type: "Specialist",
    services: ["cardiology", "cardiac", "emergency"],
    address: { city: "Lagos", state: "Nigeria" },
    continent: "Africa",
    verified: true,
    phoneNumber: "123456789",
  },
  {
    _id: "2",
    name: "General Clinic",
    type: "General",
    services: ["general"],
    address: { city: "Abuja", state: "Nigeria" },
    continent: "Africa",
    verified: false,
    phoneNumber: null,
  },
];

const STATIC_MAP = {
  "chest pain": ["cardiology", "cardiac", "heart", "emergency", "icu"],
  fever: ["general", "emergency", "infectious disease"],
  malaria: ["general", "infectious disease", "emergency"],
};

describe("matchHospitals", () => {
  it("ranks cardiology hospital higher for chest pain", async () => {
    const result = await matchHospitals(
      { symptoms: ["chest pain"], location: "Lagos" },
      hospitals,
      5,
      STATIC_MAP,
    );
    expect(result.results[0].name).toBe("City Heart Center");
  });

  it("returns a city-matched hospital over a country-matched one", async () => {
    const result = await matchHospitals(
      { symptoms: ["fever"], location: "Lagos" },
      [
        {
          _id: "3",
          name: "Abuja General",
          type: "General",
          services: ["general"],
          address: { city: "Abuja", state: "Nigeria" },
          continent: "Africa",
          verified: false,
          phoneNumber: null,
        },
        {
          _id: "4",
          name: "Lagos General",
          type: "General",
          services: ["general"],
          address: { city: "Lagos", state: "Nigeria" },
          continent: "Africa",
          verified: false,
          phoneNumber: null,
        },
      ],
      5,
      STATIC_MAP,
    );
    expect(result.results[0].name).toBe("Lagos General");
  });

  it("falls back to continent match when city and country don't match", async () => {
    const result = await matchHospitals(
      { symptoms: ["malaria"], location: "Nairobi, Kenya" },
      [
        {
          _id: "5",
          name: "Cape Town Hospital",
          type: "General",
          services: ["general", "infectious disease"],
          address: { city: "Cape Town", state: "South Africa" },
          continent: "Africa",
          verified: false,
          phoneNumber: null,
        },
      ],
      5,
      STATIC_MAP,
    );
    expect(result.results).toHaveLength(1);
    expect(result.results[0].name).toBe("Cape Town Hospital");
  });

  it("gives higher score to verified hospitals", async () => {
    const result = await matchHospitals(
      { symptoms: ["fever"], location: "Lagos" },
      [
        {
          _id: "6",
          name: "Unverified Clinic",
          type: "General",
          services: ["general"],
          address: { city: "Lagos", state: "Nigeria" },
          continent: "Africa",
          verified: false,
          phoneNumber: null,
        },
        {
          _id: "7",
          name: "Verified Clinic",
          type: "General",
          services: ["general"],
          address: { city: "Lagos", state: "Nigeria" },
          continent: "Africa",
          verified: true,
          phoneNumber: null,
        },
      ],
      5,
      STATIC_MAP,
    );
    expect(result.results[0].name).toBe("Verified Clinic");
  });

  it("still matches by continent with misspelt country", async () => {
    const result = await matchHospitals(
      { symptoms: ["malaria"], location: "Kenya" },
      [
        {
          _id: "8",
          name: "Nairobi Care",
          type: "General",
          services: ["general"],
          address: { city: "Nairobi", state: "Kenya" },
          continent: "Africa",
          verified: false,
          phoneNumber: null,
        },
      ],
      5,
      STATIC_MAP,
    );
    expect(result.results).toHaveLength(1);
    expect(result.results[0].name).toBe("Nairobi Care");
  });

  it("gives higher score to hospitals with a phone number", async () => {
    const result = await matchHospitals(
      { symptoms: ["fever"], location: "Lagos" },
      [
        {
          _id: "9",
          name: "No Phone Clinic",
          type: "General",
          services: ["general"],
          address: { city: "Lagos", state: "Nigeria" },
          continent: "Africa",
          verified: false,
          phoneNumber: null,
        },
        {
          _id: "10",
          name: "Phone Clinic",
          type: "General",
          services: ["general"],
          address: { city: "Lagos", state: "Nigeria" },
          continent: "Africa",
          verified: false,
          phoneNumber: "12345",
        },
      ],
      5,
      STATIC_MAP,
       );
    expect(result.results[0].name).toBe("Phone Clinic");
  });
});
