/**
 * Landlord units page: list, empty state, create form submit success, error on failed create.
 */
import React from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import LandlordUnitsPage from "./LandlordUnitsPage";

jest.mock("../../api/landlordApi", () => ({
  fetchLandlordUnits: jest.fn(),
  fetchLandlordProperties: jest.fn(),
  createLandlordUnit: jest.fn(),
}));

import {
  fetchLandlordUnits,
  fetchLandlordProperties,
  createLandlordUnit,
} from "../../api/landlordApi";

describe("LandlordUnitsPage", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders list of units when API returns data", async () => {
    fetchLandlordUnits.mockResolvedValue([
      {
        id: "u1",
        title: "Wohnung 1",
        address: "Bahnhofstrasse 1",
        city: "Zürich",
        rooms: 3,
        type: "Wohnung",
        property_title: "Property A",
      },
    ]);

    render(<LandlordUnitsPage />);

    await waitFor(() => {
      expect(screen.getByText("Wohnung 1")).toBeInTheDocument();
      expect(screen.getByText("Property A")).toBeInTheDocument();
      expect(screen.getByText("Zürich")).toBeInTheDocument();
    });
    expect(screen.getByText("Meine Units")).toBeInTheDocument();
  });

  it("renders empty state when no units", async () => {
    fetchLandlordUnits.mockResolvedValue([]);

    render(<LandlordUnitsPage />);

    await waitFor(() => {
      expect(screen.getByText(/keine einheiten vorhanden/i)).toBeInTheDocument();
    });
  });

  it("create form submits successfully and refreshes list", async () => {
    fetchLandlordUnits
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { id: "u1", title: "Neue Wohnung", city: "Bern", property_title: "Prop 1" },
      ]);
    fetchLandlordProperties.mockResolvedValue([
      { id: "p1", title: "Prop 1" },
    ]);
    createLandlordUnit.mockResolvedValue({
      id: "u1",
      title: "Neue Wohnung",
      city: "Bern",
      property_title: "Prop 1",
    });

    const user = userEvent.setup();
    render(<LandlordUnitsPage />);

    await waitFor(() => {
      expect(screen.getByText(/keine einheiten vorhanden/i)).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: /neue einheit/i }));
    const createFormHeading = await screen.findByRole("heading", {
      name: /Neue Einheit anlegen/i,
    });
    const createForm = createFormHeading.closest("form");
    const propertySelect = within(createForm).getByRole("combobox");

    await user.selectOptions(propertySelect, "p1");
    await user.type(screen.getByPlaceholderText(/z\. B\. Wohnung 1/i), "Neue Wohnung");
    await user.type(screen.getByPlaceholderText(/z\. B\. Zürich/i), "Bern");
    await user.click(screen.getByRole("button", { name: /einheit erstellen/i }));

    await waitFor(() => {
      expect(createLandlordUnit).toHaveBeenCalledWith(
        expect.objectContaining({
          property_id: "p1",
          title: "Neue Wohnung",
          city: "Bern",
        })
      );
    });

    await waitFor(() => {
      expect(fetchLandlordUnits).toHaveBeenCalledTimes(2);
    });
    await waitFor(() => {
      expect(screen.getByText("Einheit wurde erstellt.")).toBeInTheDocument();
    });
    await waitFor(() => {
      expect(screen.getByText("Neue Wohnung")).toBeInTheDocument();
    });
  });

  it("shows error message when create fails", async () => {
    fetchLandlordUnits.mockResolvedValue([]);
    fetchLandlordProperties.mockResolvedValue([{ id: "p1", title: "Prop 1" }]);
    createLandlordUnit.mockRejectedValue(new Error("Kein Vermieter-Zugang oder Objekt nicht zugeordnet."));

    const user = userEvent.setup();
    render(<LandlordUnitsPage />);

    await waitFor(() => {
      expect(screen.getByText(/keine einheiten vorhanden/i)).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: /neue einheit/i }));
    const createFormHeading = await screen.findByRole("heading", {
      name: /Neue Einheit anlegen/i,
    });
    const createForm = createFormHeading.closest("form");
    const propertySelect = within(createForm).getByRole("combobox");

    await user.selectOptions(propertySelect, "p1");
    await user.type(screen.getByPlaceholderText(/z\. B\. Wohnung 1/i), "Unit");
    await user.click(screen.getByRole("button", { name: /einheit erstellen/i }));

    await waitFor(() => {
      expect(screen.getByText(/kein vermieter-zugang oder objekt nicht zugeordnet/i)).toBeInTheDocument();
    });
  });
});
