/**
 * Landlord tenancies page: list, empty state, error state.
 */
import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import LandlordTenanciesPage from "./LandlordTenanciesPage";

jest.mock("../../api/landlordApi", () => ({
  fetchLandlordTenancies: jest.fn(),
}));

import { fetchLandlordTenancies } from "../../api/landlordApi";

describe("LandlordTenanciesPage", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders list of tenancies when API returns data", async () => {
    fetchLandlordTenancies.mockResolvedValue([
      {
        id: "t1",
        unit_id: "u1",
        unit_title: "Wohnung 1",
        property_id: "p1",
        property_title: "Property A",
        tenant_name: "Max Mustermann",
        tenant_email: "max@example.com",
        move_in_date: "2024-01-01",
        move_out_date: null,
        monthly_rent: 1500,
        status: "active",
      },
    ]);

    render(<LandlordTenanciesPage />);

    await waitFor(() => {
      expect(screen.getByText("Max Mustermann")).toBeInTheDocument();
      expect(screen.getByText("Property A")).toBeInTheDocument();
      expect(screen.getByText("Wohnung 1")).toBeInTheDocument();
      expect(screen.getByText("active")).toBeInTheDocument();
    });
    expect(screen.getByText("Mietverhältnisse")).toBeInTheDocument();
  });

  it("renders empty state when API returns empty list", async () => {
    fetchLandlordTenancies.mockResolvedValue([]);

    render(<LandlordTenanciesPage />);

    await waitFor(() => {
      expect(screen.getByText(/keine mietverhältnisse vorhanden/i)).toBeInTheDocument();
    });
  });

  it("renders error state when API fails", async () => {
    fetchLandlordTenancies.mockRejectedValue(new Error("Network error"));

    render(<LandlordTenanciesPage />);

    await waitFor(() => {
      expect(screen.getByText("Network error")).toBeInTheDocument();
    });
  });
});
