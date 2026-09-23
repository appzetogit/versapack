import { sendResponse } from '../../../../utils/response.js';
import {
    listAddresses,
    getAddressById,
    addAddress,
    updateAddress,
    deleteAddress,
    setDefaultAddress
} from '../services/userAddress.service.js';
import { validateCreateAddressDto, validateUpdateAddressDto } from '../validators/userAddress.validator.js';

const logAddressCoords = (action, addressId, addressObj, userId) => {
    const lat = addressObj?.latitude ?? addressObj?.lat ?? addressObj?.location?.coordinates?.[1] ?? null;
    const lng = addressObj?.longitude ?? addressObj?.lng ?? addressObj?.location?.coordinates?.[0] ?? null;
    console.log(`📍 [USER_ADDRESS_LOG] Action: ${action} | AddressID: ${addressId || 'N/A'} | UserID: ${userId} | Lat: ${lat}, Lng: ${lng}`);
};

export const listAddressesController = async (req, res, next) => {
    try {
        const { userId } = req.user;
        const result = await listAddresses(userId);
        (result.addresses || []).forEach((addr) => {
            logAddressCoords('LIST', addr._id || addr.id, addr, userId);
        });
        return sendResponse(res, 200, 'Addresses retrieved successfully', result);
    } catch (err) {
        next(err);
    }
};

export const getAddressByIdController = async (req, res, next) => {
    try {
        const { userId } = req.user;
        const { addressId } = req.params;
        const result = await getAddressById(userId, addressId);
        logAddressCoords('GET_BY_ID', addressId, result?.address, userId);
        return sendResponse(res, 200, 'Address retrieved successfully', result);
    } catch (err) {
        next(err);
    }
};

export const addAddressController = async (req, res, next) => {
    try {
        const { userId } = req.user;
        const dto = validateCreateAddressDto(req.body);
        const result = await addAddress(userId, dto);
        logAddressCoords('ADD', result?.address?._id || result?.address?.id, result?.address, userId);
        return sendResponse(res, 201, 'Address saved successfully', result);
    } catch (err) {
        next(err);
    }
};

export const updateAddressController = async (req, res, next) => {
    try {
        const { userId } = req.user;
        const { addressId } = req.params;
        const dto = validateUpdateAddressDto(req.body);
        const result = await updateAddress(userId, addressId, dto);
        logAddressCoords('UPDATE', addressId, result?.address, userId);
        return sendResponse(res, 200, 'Address updated successfully', result);
    } catch (err) {
        next(err);
    }
};

export const deleteAddressController = async (req, res, next) => {
    try {
        const { userId } = req.user;
        const { addressId } = req.params;
        const result = await deleteAddress(userId, addressId);
        console.log(`📍 [USER_ADDRESS_LOG] Action: DELETE | AddressID: ${addressId} | UserID: ${userId}`);
        return sendResponse(res, 200, 'Address deleted successfully', result);
    } catch (err) {
        next(err);
    }
};

export const setDefaultAddressController = async (req, res, next) => {
    try {
        const { userId } = req.user;
        const { addressId } = req.params;
        const result = await setDefaultAddress(userId, addressId);
        logAddressCoords('SET_DEFAULT', addressId, result?.address, userId);
        return sendResponse(res, 200, 'Default address updated successfully', result);
    } catch (err) {
        next(err);
    }
};


