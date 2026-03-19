/**
 * Landlord properties page: empty state and property list.
 */
import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import LandlordPropertiesPage from "./LandlordPropertiesPage";

jest.mock("../../api/landlordApi", () => ({
  fetchLandlordProperties: jest.fn(),
}));

import { fetchLandlordProperties } from "../../api/landlordApi";

describe("LandlordPropertiesPage", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders empty state when API returns empty list", async () => {
    fetchLandlordProperties.mockResolvedValue([]);

    render(<LandlordPropertiesPage />);

    await waitFor(() => {
      expect(screen.getByText(/keine objekte vorhanden/i)).toBeInTheDocument();
    });
    expect(screen.getByText("Meine Properties")).toBeInTheDocument();
  });

  it("renders property rows when data exists", async () => {
    fetchLandlordProperties.mockResolvedValue([
      { id: "p1", title: "Property A", city: "Zurich", status: "active" },
      { id: "p2", title: "Property B", street: "Main St", city: "Bern", status: "active" },
    ]);

    render(<LandlordPropertiesPage />);

    await waitFor(() => {
      expect(screen.getByText("Property A")).toBeInTheDocument();
      expect(screen.getByText("Property B")).toBeInTheDocument();
    });
    expect(screen.getByText("Meine Properties")).toBeInTheDocument();
    expect(screen.getByText(/zurich/i)).toBeInTheDocument();
    expect(screen.getByText(/bern/i)).toBeInTheDocument();
  });
});
