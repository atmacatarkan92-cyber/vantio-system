/**
 * Landlord overview page: loading, success with summary data, error state.
 */
import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import LandlordOverviewPage from "./LandlordOverviewPage";

jest.mock("../../api/landlordApi", () => ({
  fetchLandlordMe: jest.fn(),
  fetchLandlordProperties: jest.fn(),
  fetchLandlordUnits: jest.fn(),
  fetchLandlordTenancies: jest.fn(),
  fetchLandlordInvoices: jest.fn(),
}));

import {
  fetchLandlordMe,
  fetchLandlordProperties,
  fetchLandlordUnits,
  fetchLandlordTenancies,
  fetchLandlordInvoices,
} from "../../api/landlordApi";

function mockAllResolved(overrides = {}) {
  fetchLandlordMe.mockResolvedValue({
    full_name: "Test Landlord",
    email: "landlord@test.com",
    company_name: "Test Co",
    contact_name: "Test Landlord",
    phone: "",
    ...overrides.me,
  });
  fetchLandlordProperties.mockResolvedValue(overrides.properties ?? []);
  fetchLandlordUnits.mockResolvedValue(overrides.units ?? []);
  fetchLandlordTenancies.mockResolvedValue(overrides.tenancies ?? []);
  fetchLandlordInvoices.mockResolvedValue(overrides.invoices ?? []);
}

describe("LandlordOverviewPage", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders loading state initially", () => {
    fetchLandlordMe.mockImplementation(() => new Promise(() => {}));
    fetchLandlordProperties.mockImplementation(() => new Promise(() => {}));
    fetchLandlordUnits.mockImplementation(() => new Promise(() => {}));
    fetchLandlordTenancies.mockImplementation(() => new Promise(() => {}));
    fetchLandlordInvoices.mockImplementation(() => new Promise(() => {}));

    render(<LandlordOverviewPage />);
    expect(screen.getByText(/lade/i)).toBeInTheDocument();
  });

  it("renders summary data when API succeeds", async () => {
    mockAllResolved({ properties: [{ id: "1" }], units: [{ id: "1" }] });

    render(<LandlordOverviewPage />);

    await waitFor(() => {
      expect(screen.getByText("Mein Bereich")).toBeInTheDocument();
    });
    expect(screen.getByText("Test Landlord")).toBeInTheDocument();
    expect(screen.getByText("landlord@test.com")).toBeInTheDocument();
    // Summary shows "1" for both properties and units — multiple nodes match.
    expect(screen.getAllByText("1").length).toBeGreaterThanOrEqual(2);
  });

  it("renders error state when API fails", async () => {
    fetchLandlordMe.mockRejectedValue(new Error("Network error"));
    fetchLandlordProperties.mockResolvedValue([]);
    fetchLandlordUnits.mockResolvedValue([]);
    fetchLandlordTenancies.mockResolvedValue([]);
    fetchLandlordInvoices.mockResolvedValue([]);

    render(<LandlordOverviewPage />);

    await waitFor(() => {
      expect(screen.getByText(/daten konnten nicht geladen werden|network error/i)).toBeInTheDocument();
    });
  });
});
